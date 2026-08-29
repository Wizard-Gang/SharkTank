<?php

declare(strict_types=1);

namespace ModulePHP\Server;

use ModulePHP\Engine\Room;
use ModulePHP\Store\BlobStore;
use Workerman\Connection\TcpConnection;
use Workerman\Timer;
use Workerman\Worker;

/**
 * The realtime game host — PHP's answer to the Room Durable Object.
 *
 *   Room Durable Object (Cloudflare)      ⟺   this class
 *   ───────────────────────────────────       ─────────────────────────────
 *   one DO instance per arena (isolated)  ⟺   one Worker with ->count = 1
 *   in-memory RoomState                   ⟺   $this->room (in-memory)
 *   setInterval(tick, 1000/30)            ⟺   Timer::add(1/30, ...)
 *   WebSocketPair / ws.send               ⟺   websocket:// worker, $conn->send()
 *   report to Lobby DO                    ⟺   write snapshots to the BlobStore
 *   deterministic game log for replay     ⟺   $this->gameLog (+ persisted to store)
 *
 * Bind it to a Workerman websocket Worker and it runs the authoritative sim, broadcasts
 * snapshots, and publishes lobby/leaderboard/audit/game-log to the shared store so the
 * HTTP worker can serve them.
 */
final class GameServer
{
    private Room $room;
    /** @var list<array{ts:int,tick:int,action:array<string,mixed>}> */
    private array $gameLog = [];
    /** @var array<int,string> connection id → playerId */
    private array $players = [];
    /** @var array<string,bool> playerId → last-seen alive flag (for one-shot "died") */
    private array $wasAlive = [];
    private int $started;

    public function __construct(
        private readonly BlobStore $store,
        private readonly string $roomId = 'room-1',
        private readonly string $roomName = 'Meadow',
        private readonly int $botCount = 23,
    ) {
        $this->room = new Room("seed-{$roomId}", $roomId);
        $this->room->spawnBots($botCount);
        $this->started = time();
    }

    /** Wire this server onto a `websocket://` Worker. */
    public function bind(Worker $ws): void
    {
        $ws->name = "snake-room:{$this->roomId}";
        $ws->count = 1; // single authoritative process — like one Durable Object instance

        $ws->onConnect = function (TcpConnection $conn): void {
            $this->players[$conn->id] = 'p-' . bin2hex(random_bytes(4));
        };

        $ws->onMessage = function (TcpConnection $conn, $data): void {
            $this->onMessage($conn, (string) $data);
        };

        $ws->onClose = function (TcpConnection $conn): void {
            $pid = $this->players[$conn->id] ?? null;
            if ($pid !== null) {
                $this->applyAndLog(['type' => 'leave', 'playerId' => $pid]);
                $this->audit('leave', $pid);
                unset($this->players[$conn->id], $this->wasAlive[$pid]);
            }
        };

        $ws->onWorkerStart = function () use ($ws): void {
            // The 30Hz authoritative tick loop (this is the DO's setInterval).
            Timer::add(1 / Room::TICKS_PER_SECOND, function () use ($ws): void {
                $this->room->step();

                // Fire a one-shot "died" when a player's snake transitions alive → dead,
                // so the client can show the death screen + respawn.
                foreach ($ws->connections as $conn) {
                    $pid = $this->players[$conn->id] ?? null;
                    if ($pid === null) {
                        continue;
                    }
                    $snake = $this->room->snakes[$pid] ?? null;
                    $alive = $snake['alive'] ?? false;
                    if (($this->wasAlive[$pid] ?? true) && !$alive && $snake) {
                        $respawnInMs = max(0, ($snake['respawnTick'] - $this->room->tick) * (1000 / Room::TICKS_PER_SECOND));
                        $conn->send(json_encode(['t' => 'died', 'by' => null, 'score' => $snake['score'], 'respawnInMs' => $respawnInMs], JSON_UNESCAPED_SLASHES));
                        $this->audit('death', $snake['name'] ?? $pid);
                    }
                    $this->wasAlive[$pid] = $alive;
                }

                $payload = json_encode(['t' => 'state', 'state' => $this->room->toNetState()], JSON_UNESCAPED_SLASHES);
                foreach ($ws->connections as $conn) {
                    $conn->send($payload);
                }
                if ($this->room->tick % 15 === 0) {
                    $this->broadcast($ws, ['t' => 'leaderboard', 'entries' => $this->room->leaderboard(10)]);
                }
                if ($this->room->tick % Room::TICKS_PER_SECOND === 0) {
                    $this->publish(); // ~1×/sec: lobby + status + game log to the store
                }
            });
        };
    }

    private function onMessage(TcpConnection $conn, string $data): void
    {
        $pid = $this->players[$conn->id] ?? null;
        if ($pid === null) {
            return;
        }
        $msg = json_decode($data, true);
        if (!is_array($msg)) {
            return;
        }
        switch ($msg['t'] ?? '') {
            case 'hello':
                $name = substr((string) ($msg['name'] ?? 'Player'), 0, 16);
                $skin = $msg['skin'] ?? Room::DEFAULT_SKIN;
                $this->applyAndLog(['type' => 'join', 'playerId' => $pid, 'name' => $name, 'skin' => $skin]);
                $conn->send(json_encode(['t' => 'welcome', 'youId' => $pid, 'roomId' => $this->roomId, 'state' => $this->room->toNetState()], JSON_UNESCAPED_SLASHES));
                $this->audit('join', $name);
                break;
            case 'input':
                $action = $msg['action'] ?? [];
                $action['playerId'] = $pid; // never trust a client-supplied id
                $this->applyAndLog($action);
                break;
            case 'ping':
                $conn->send(json_encode(['t' => 'pong', 'ts' => $msg['ts'] ?? 0]));
                break;
        }
    }

    /** Apply an external action AND record it (with its tick) to the game log. */
    private function applyAndLog(array $action): void
    {
        $this->room->applyAction($action);
        $this->gameLog[] = ['ts' => (int) (microtime(true) * 1000), 'tick' => $this->room->tick, 'action' => $action];
        if (count($this->gameLog) > 200000) {
            array_splice($this->gameLog, 0, count($this->gameLog) - 200000);
        }
    }

    private function broadcast(Worker $ws, array $msg): void
    {
        $payload = json_encode($msg, JSON_UNESCAPED_SLASHES);
        foreach ($ws->connections as $conn) {
            $conn->send($payload);
        }
    }

    /** Append a user-action event to the shared 90-day audit log. */
    private function audit(string $type, string $subject): void
    {
        $log = $this->store->getJson('audit/user') ?? [];
        $log[] = ['ts' => (int) (microtime(true) * 1000), 'type' => $type, 'room' => $this->roomId, 'subject' => $subject];
        if (count($log) > 5000) {
            $log = array_slice($log, -5000);
        }
        $this->store->putJson('audit/user', $log);
    }

    /** Publish lobby presence, leaderboard, status, and the replayable game log. */
    private function publish(): void
    {
        $top = $this->room->leaderboard(1)[0] ?? null;
        $this->store->putJson("lobby/{$this->roomId}", [
            'id' => $this->roomId,
            'name' => $this->roomName,
            'players' => $this->room->playerCount(),
            'capacity' => 24,
            'topScore' => $top['score'] ?? 0,
            'topName' => $top['name'] ?? '—',
            'at' => (int) (microtime(true) * 1000),
        ]);
        $this->store->putJson('leaderboard/global', $this->room->leaderboard(25));
        $this->store->putJson('status/usage', [
            'startedAt' => $this->started * 1000,
            'uptimeMs' => (time() - $this->started) * 1000,
            'tick' => $this->room->tick,
            'players' => $this->room->playerCount(),
            'gameLogEntries' => count($this->gameLog),
        ]);
        // Game log (seed + botCount + actions) — everything needed to replay this game.
        $this->store->putJson("gamelog/{$this->roomId}", [
            'roomId' => $this->roomId,
            'seed' => $this->room->seed,
            'botCount' => $this->botCount,
            'tick' => $this->room->tick,
            'events' => $this->gameLog,
        ]);
    }
}
