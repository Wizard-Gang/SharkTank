<?php

declare(strict_types=1);

namespace ModulePHP\Server;

use ModulePHP\Engine\Room;
use ModulePHP\Store\BlobStore;
use Workerman\Connection\TcpConnection;
use Workerman\Protocols\Http\Request;
use Workerman\Protocols\Http\Response;
use Workerman\Worker;

/**
 * HTTP worker — the Cloudflare Worker's `fetch()` handler in PHP. Serves the static
 * client, the JSON API, and the ops pages (/docs OpenAPI, /status, /audit + replay).
 * Reads game state from the shared BlobStore that the GameServer publishes to.
 *
 * The /docs/openapi.json response is served VERBATIM from the same file the TS backend
 * emits, so the contract is byte-identical across both backends.
 */
final class HttpServer
{
    private const CATALOG = [
        ['id' => 'room-1', 'name' => 'Meadow'],
        ['id' => 'room-2', 'name' => 'Canyon'],
        ['id' => 'room-3', 'name' => 'Tundra'],
        ['id' => 'room-4', 'name' => 'Nebula'],
    ];

    public function __construct(
        private readonly BlobStore $store,
        private readonly string $publicDir,
    ) {
    }

    public function bind(Worker $http): void
    {
        $http->name = 'snake-http';
        $http->onMessage = function (TcpConnection $conn, Request $req): void {
            // Preflight for cross-origin calls from the R3F client (served on another port).
            if ($req->method() === 'OPTIONS') {
                $conn->send(new Response(204, self::CORS));
                return;
            }
            $resp = $this->route($req);
            $resp->withHeaders(self::CORS);
            $conn->send($resp);
        };
    }

    private const CORS = [
        'Access-Control-Allow-Origin' => '*',
        'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers' => 'Content-Type',
    ];

    private function route(Request $req): Response
    {
        $path = $req->path();

        // Byte-identical OpenAPI contract (shared file).
        if ($path === '/docs/openapi.json' || $path === '/openapi.json') {
            return $this->file('openapi.json', 'application/json; charset=utf-8');
        }
        if ($path === '/docs' || $path === '/docs/') {
            return $this->html($this->docsHtml());
        }

        if ($path === '/api/lobby') {
            return $this->json(['ok' => true, 'rooms' => $this->lobby()]);
        }
        if ($path === '/api/leaderboard') {
            return $this->json(['ok' => true, 'entries' => $this->store->getJson('leaderboard/global') ?? []]);
        }
        if ($path === '/api/health') {
            return $this->json(['ok' => true, 'module' => 'module-php', 'time' => gmdate('c')]);
        }
        if ($path === '/api/profile') {
            $id = $req->get('id') ?? 'local';
            $key = "profiles/{$id}";
            if ($req->method() === 'POST') {
                $body = json_decode($req->rawBody(), true) ?: [];
                $prev = $this->store->getJson($key) ?? ['name' => 'Player', 'skin' => 'cyan', 'best' => 0];
                $next = [
                    'name' => substr((string) ($body['name'] ?? $prev['name']), 0, 16),
                    'skin' => $body['skin'] ?? $prev['skin'],
                    'best' => max($prev['best'] ?? 0, $body['best'] ?? 0),
                    'settings' => $body['settings'] ?? ($prev['settings'] ?? null),
                ];
                $this->store->putJson($key, $next);
                return $this->json(['ok' => true, 'profile' => $next]);
            }
            return $this->json(['ok' => true, 'profile' => $this->store->getJson($key) ?? ['name' => 'Player', 'skin' => 'cyan', 'best' => 0]]);
        }
        if ($path === '/api/audit' && $req->method() === 'POST') {
            $body = json_decode($req->rawBody(), true) ?: [];
            if (empty($body['type'])) {
                return $this->json(['ok' => false, 'error' => 'type required'], 400);
            }
            $log = $this->store->getJson('audit/user') ?? [];
            $log[] = ['ts' => (int) (microtime(true) * 1000), 'type' => $body['type'], 'subject' => $body['subject'] ?? null, 'room' => $body['room'] ?? null, 'detail' => $body['detail'] ?? null];
            if (count($log) > 5000) {
                $log = array_slice($log, -5000);
            }
            $this->store->putJson('audit/user', $log);
            return $this->json(['ok' => true]);
        }

        if ($path === '/status.json') {
            return $this->json(['ok' => true, 'usage' => $this->store->getJson('status/usage') ?? [], 'rooms' => $this->lobby()]);
        }
        if ($path === '/status' || $path === '/status/') {
            return $this->html($this->statusHtml());
        }

        if ($path === '/audit.json') {
            return $this->json(['ok' => true, 'events' => $this->store->getJson('audit/user') ?? [], 'retentionDays' => 90]);
        }
        if ($path === '/audit' || $path === '/audit/') {
            return $this->html($this->auditHtml());
        }
        if (preg_match('#^/audit/game/([^/]+?)(\.jsonl|\.json)?$#', $path, $m)) {
            $log = $this->store->getJson("gamelog/{$m[1]}") ?? ['events' => []];
            if (($m[2] ?? '') === '.jsonl') {
                return $this->ndjson($log['events'] ?? []);
            }
            return $this->json($log);
        }
        if (preg_match('#^/audit/replay/([^/]+?)(\.json)?$#', $path, $m)) {
            return $this->replay($m[1], (int) ($req->get('tick') ?? PHP_INT_MAX));
        }

        return $this->static($path);
    }

    /** @return list<array<string,mixed>> */
    private function lobby(): array
    {
        $now = (int) (microtime(true) * 1000);
        $rooms = [];
        foreach (self::CATALOG as $c) {
            $r = $this->store->getJson("lobby/{$c['id']}");
            $fresh = $r && ($now - ($r['at'] ?? 0) < 8000);
            $rooms[] = [
                'id' => $c['id'],
                'name' => $c['name'],
                'players' => $fresh ? $r['players'] : 0,
                'capacity' => 24,
                'topScore' => $fresh ? $r['topScore'] : 0,
                'topName' => $fresh ? $r['topName'] : '—',
            ];
        }
        return $rooms;
    }

    private function replay(string $roomId, int $tick): Response
    {
        $log = $this->store->getJson("gamelog/{$roomId}");
        if (!$log) {
            return $this->json(['ok' => false, 'error' => 'no game log'], 404);
        }
        $toTick = max(0, min($log['tick'], $tick));
        $room = Room::replay($log['seed'], $roomId, $log['botCount'], $log['events'], $toTick);
        return $this->json(['ok' => true, 'roomId' => $roomId, 'tick' => $toTick, 'state' => $room->toNetState()]);
    }

    // ── Static files ────────────────────────────────────────────────────────────
    private function static(string $path): Response
    {
        $rel = $path === '/' ? 'index.html' : ltrim($path, '/');
        $full = realpath($this->publicDir . '/' . $rel);
        if ($full === false || !str_starts_with($full, realpath($this->publicDir)) || !is_file($full)) {
            // SPA fallback: serve index.html for unknown non-file routes.
            return $this->file('index.html', 'text/html; charset=utf-8');
        }
        return $this->file($rel, self::mime($full));
    }

    private static function mime(string $file): string
    {
        return match (strtolower(pathinfo($file, PATHINFO_EXTENSION))) {
            'html' => 'text/html; charset=utf-8',
            'js' => 'text/javascript; charset=utf-8',
            'css' => 'text/css; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'svg' => 'image/svg+xml',
            default => 'application/octet-stream',
        };
    }

    private function file(string $rel, string $type): Response
    {
        $full = $this->publicDir . '/' . $rel;
        $body = is_file($full) ? (string) file_get_contents($full) : '';
        return new Response(is_file($full) ? 200 : 404, ['Content-Type' => $type, 'Cache-Control' => 'no-store'], $body);
    }

    private function json(mixed $data, int $status = 200): Response
    {
        return new Response($status, ['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'no-store'], json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function ndjson(array $events): Response
    {
        $lines = array_map(fn($e) => json_encode($e, JSON_UNESCAPED_SLASHES), $events);
        $body = implode("\n", $lines) . ($lines ? "\n" : '');
        return new Response(200, ['Content-Type' => 'application/x-ndjson; charset=utf-8', 'Cache-Control' => 'no-store'], $body);
    }

    private function html(string $body, int $status = 200): Response
    {
        return new Response($status, ['Content-Type' => 'text/html; charset=utf-8', 'Cache-Control' => 'no-store'], $body);
    }

    // ── Ops pages (server-rendered HTML — PHP's home turf) ────────────────────────
    private function shell(string $title, string $inner): string
    {
        $css = 'body{margin:0;background:#0b0a14;color:#f3f1ff;font:15px/1.6 ui-sans-serif,system-ui,sans-serif}main{max-width:900px;margin:0 auto;padding:32px 20px}h1{font-size:1.7rem;margin:0 0 4px}p.sub{color:#b9b4d6;margin:0 0 20px}a{color:#a78bff}nav{display:flex;gap:12px;margin:0 0 20px}nav a{padding:6px 12px;border:1px solid #3a355e;border-radius:8px;text-decoration:none}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #3a355e}th{color:#b9b4d6}code{background:#201d3b;padding:2px 6px;border-radius:6px;font-family:ui-monospace,monospace}.card{background:#16142a;border:1px solid #3a355e;border-radius:12px;padding:16px 18px;margin:0 0 14px}.badge{display:inline-block;padding:2px 8px;border-radius:6px;background:#201d3b;font-size:.8rem;color:#57ff5a;font-weight:700}';
        return "<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{$title}</title><style>{$css}</style></head><body><main><nav><a href='/'>← Game</a><a href='/docs/'>Docs</a><a href='/status/'>Status</a><a href='/audit/'>Audit</a></nav><p><span class=badge>PHP backend</span></p>{$inner}</main></body></html>";
    }

    private function docsHtml(): string
    {
        return $this->shell('Snake — API Docs (PHP)', "<h1>Snake API</h1><p class=sub>Same contract as the TypeScript backend — the raw document at <a href='/docs/openapi.json'>/docs/openapi.json</a> is served byte-for-byte identical. This PoC implements the endpoints in PHP.</p><div class=card><p>Open <a href='/docs/openapi.json'>/docs/openapi.json</a> to see all 11 paths + 11 schemas. Diff it against the TypeScript backend's — they match.</p></div>");
    }

    private function statusHtml(): string
    {
        $u = $this->store->getJson('status/usage') ?? [];
        $rooms = $this->lobby();
        $rows = '';
        foreach ($rooms as $r) {
            $rows .= '<tr><td>' . htmlspecialchars($r['name']) . '</td><td>' . $r['players'] . ' / ' . $r['capacity'] . '</td><td>' . $r['topScore'] . '</td><td>' . htmlspecialchars($r['topName']) . '</td></tr>';
        }
        $mins = (int) (($u['uptimeMs'] ?? 0) / 60000);
        return $this->shell('Snake — Status (PHP)', "<h1>Server status</h1><p class=sub>Live server (PHP/Workerman). Auto-refreshes. JSON at <a href='/status.json'>/status.json</a>.</p><div class=card><p>uptime <b>{$mins}m</b> · tick <b>" . ($u['tick'] ?? 0) . "</b> · players <b>" . ($u['players'] ?? 0) . "</b> · game-log entries <b>" . ($u['gameLogEntries'] ?? 0) . "</b></p></div><div class=card><table><thead><tr><th>Arena</th><th>Players</th><th>Top</th><th>Leader</th></tr></thead><tbody>{$rows}</tbody></table></div><script>setTimeout(()=>location.reload(),3000)</script>");
    }

    private function auditHtml(): string
    {
        $rooms = '';
        foreach (self::CATALOG as $c) {
            $rooms .= "<tr><td><code>{$c['id']}</code></td><td><a href='/audit/game/{$c['id']}.jsonl'>game log</a></td><td><a href='/audit/replay/{$c['id']}'>replay latest</a></td></tr>";
        }
        $script = "async function tick(){try{var r=await fetch('/audit.json?limit=200');var d=await r.json();var ev=d.events||[];var tb=document.getElementById('rows');tb.textContent='';ev.slice().reverse().forEach(function(e){var tr=document.createElement('tr');[new Date(e.ts).toLocaleTimeString(),e.type,e.subject||'',e.room||''].forEach(function(v,i){var td=document.createElement('td');if(i===1){var c=document.createElement('code');c.textContent=v;td.appendChild(c);}else{td.textContent=v;}tr.appendChild(td);});tb.appendChild(tr);});document.getElementById('count').textContent='('+ev.length+')';}catch(e){}}tick();setInterval(tick,1500);";
        return $this->shell('Snake — Audit (PHP)', "<h1>Audit log</h1><p class=sub>Real-time user-action log (90-day). Game logs are per-room (3-day) and fully replayable.</p><div class=card><h2 style='margin:0 0 10px;font-size:1.1rem'>User actions <span id=count style='color:#b9b4d6'></span></h2><table><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Room</th></tr></thead><tbody id=rows></tbody></table></div><div class=card><h2 style='margin:0 0 10px;font-size:1.1rem'>Game logs (replayable)</h2><table><thead><tr><th>Room</th><th>Log</th><th>Reconstruct</th></tr></thead><tbody>{$rooms}</tbody></table></div><script>{$script}</script>");
    }
}
