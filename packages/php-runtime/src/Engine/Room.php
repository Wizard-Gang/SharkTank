<?php

declare(strict_types=1);

namespace ModulePHP\Engine;

/**
 * Deterministic snake.io-style room simulation — a PHP port of the TypeScript engine's
 * room.ts. Pure logic over serializable state (no I/O, no sockets), so the exact same
 * code drives the live game AND deterministic replay.
 *
 * Snakes and food are plain arrays (JSON-shaped) so `toNetState()` emits a wire payload
 * byte-compatible with the TS server, and the same React client renders either backend.
 *
 * Snake shape: id, name, skin, path[[x,z]], segments[{x,z}], heading, targetHeading,
 *              length, boosting, score, alive, isBot, respawnTick, invulnTick.
 * Food shape:  id, x, z, value, r.
 */
final class Room
{
    // ── Tuning (mirrors room.ts, 30Hz build) ──────────────────────────────────
    public const TICKS_PER_SECOND = 40;
    private const ARENA_RADIUS = 95.0;
    private const BASE_SPEED = 0.278;
    private const BOOST_SPEED = 0.525;
    private const TURN_RATE = 0.11;
    private const SEGMENT_SPACING = 0.62;
    private const START_LENGTH = 10;
    private const MIN_LENGTH = 6;
    private const TAIL_MARGIN = 1.5;
    private const HEAD_RADIUS = 0.7;
    private const EAT_RADIUS = 1.2;
    private const BOOST_DRAIN_EVERY = 8;
    private const RESPAWN_DELAY = 80; // 2s
    private const SPAWN_GRACE = 64;   // ~1.6s
    private const AMBIENT_FOOD = 260;
    private const FOOD_SPAWN_PER_TICK = 2;
    private const MAX_TOTAL_FOOD = 450; // hard cap incl. corpse drops (keeps dots sane)

    /** @var array<string,array{id:string,name:string,color:string,accent:string}> */
    public const SKINS = [
        ['id' => 'cyan', 'name' => 'Cyan', 'color' => '#22e6ff', 'accent' => '#0891b2'],
        ['id' => 'orange', 'name' => 'Orange', 'color' => '#ff8a1f', 'accent' => '#c2410c'],
        ['id' => 'lime', 'name' => 'Lime', 'color' => '#57ff5a', 'accent' => '#15803d'],
        ['id' => 'magenta', 'name' => 'Magenta', 'color' => '#ff43d4', 'accent' => '#a21caf'],
        ['id' => 'gold', 'name' => 'Gold', 'color' => '#ffe14d', 'accent' => '#b8890a'],
        ['id' => 'violet', 'name' => 'Violet', 'color' => '#a78bff', 'accent' => '#6d28d9'],
    ];
    public const DEFAULT_SKIN = 'cyan';
    private const BOT_NAMES = ['Slinky', 'Noodle', 'Fang', 'Zippy', 'Coil', 'Viper', 'Wriggle', 'Dash', 'Boa', 'Mamba'];

    public string $seed;
    public string $id;
    public int $tick = 0;
    public int $rngState;
    public float $arenaRadius;
    /** @var array<string,array<string,mixed>> keyed by snake id */
    public array $snakes = [];
    /** @var list<array<string,mixed>> */
    public array $food = [];

    public function __construct(string $seed = 'seed-fixed', string $id = 'room-local')
    {
        $this->seed = $seed;
        $this->id = $id;
        $this->rngState = Rng::seedToNumber($seed);
        $this->arenaRadius = self::ARENA_RADIUS;
        for ($i = 0; $i < self::AMBIENT_FOOD; $i++) {
            $this->spawnAmbientFood();
        }
    }

    // ── RNG helpers (thread state through the snapshot) ────────────────────────
    private function rand(): float
    {
        [$v, $next] = Rng::nextRandom($this->rngState);
        $this->rngState = $next;
        return $v;
    }

    private function randRange(float $min, float $max): float
    {
        return $min + $this->rand() * ($max - $min);
    }

    private function randomPointInArena(): array
    {
        $r = sqrt($this->rand()) * ($this->arenaRadius - 2);
        $a = $this->rand() * M_PI * 2;
        return ['x' => cos($a) * $r, 'z' => sin($a) * $r];
    }

    private function spawnAmbientFood(): void
    {
        $p = $this->randomPointInArena();
        $this->food[] = [
            'id' => 'f-' . $this->tick . '-' . base_convert((string) (int) floor($this->rand() * 1e9), 10, 36),
            'x' => $p['x'],
            'z' => $p['z'],
            'value' => 1,
            'r' => 0.45,
        ];
    }

    // ── Body: sample the head trail at fixed arc-length (no wobble) ────────────
    private static function segmentCount(float $length): int
    {
        return (int) max(self::MIN_LENGTH, round($length));
    }

    /** @param list<array{x:float,z:float}> $path @return list<array{x:float,z:float}> */
    public static function sampleTrail(array $path, int $count, float $fallbackHeading): array
    {
        $out = [['x' => $path[0]['x'], 'z' => $path[0]['z']]];
        $seg = 1;
        $acc = 0.0;
        $n = count($path);
        for ($i = 0; $i < $n - 1 && $seg < $count; $i++) {
            $a = $path[$i];
            $b = $path[$i + 1];
            $edge = hypot($b['x'] - $a['x'], $b['z'] - $a['z']);
            if ($edge <= 1e-6) {
                continue;
            }
            $along = 0.0;
            while ($acc + ($edge - $along) >= self::SEGMENT_SPACING && $seg < $count) {
                $need = self::SEGMENT_SPACING - $acc;
                $along += $need;
                $f = $along / $edge;
                $out[] = ['x' => $a['x'] + ($b['x'] - $a['x']) * $f, 'z' => $a['z'] + ($b['z'] - $a['z']) * $f];
                $seg++;
                $acc = 0.0;
            }
            $acc += $edge - $along;
        }
        while (count($out) < $count) {
            $last = $out[count($out) - 1];
            $prev = $out[count($out) - 2] ?? $last;
            $dx = ($last['x'] - $prev['x']) ?: cos($fallbackHeading + M_PI);
            $dz = ($last['z'] - $prev['z']) ?: sin($fallbackHeading + M_PI);
            $d = hypot($dx, $dz) ?: 1.0;
            $out[] = ['x' => $last['x'] + ($dx / $d) * self::SEGMENT_SPACING, 'z' => $last['z'] + ($dz / $d) * self::SEGMENT_SPACING];
        }
        return $out;
    }

    private static function validSkin(?string $skin): string
    {
        foreach (self::SKINS as $s) {
            if ($s['id'] === $skin) {
                return $skin;
            }
        }
        return self::DEFAULT_SKIN;
    }

    private function safeSpawn(): array
    {
        $inner = $this->arenaRadius * 0.55;
        $occupied = [];
        foreach ($this->snakes as $s) {
            if (!$s['alive']) {
                continue;
            }
            for ($i = 0; $i < count($s['segments']); $i += 3) {
                $occupied[] = $s['segments'][$i];
            }
        }
        $best = ['x' => 0.0, 'z' => 0.0];
        $bestDist = -1.0;
        for ($attempt = 0; $attempt < 16; $attempt++) {
            $r = sqrt($this->rand()) * $inner;
            $a = $this->rand() * M_PI * 2;
            $p = ['x' => cos($a) * $r, 'z' => sin($a) * $r];
            $nearest = INF;
            foreach ($occupied as $o) {
                $nearest = min($nearest, hypot($o['x'] - $p['x'], $o['z'] - $p['z']));
            }
            if ($nearest > $bestDist) {
                $bestDist = $nearest;
                $best = $p;
                if ($nearest > 10 || count($occupied) === 0) {
                    break;
                }
            }
        }
        return $best;
    }

    private function makeSnake(string $id, string $name, string $skin, bool $isBot): array
    {
        $spawn = $this->safeSpawn();
        $heading = atan2(-$spawn['z'], -$spawn['x']) + $this->randRange(-0.5, 0.5);
        $path = [];
        for ($i = 0; $i < self::START_LENGTH + 3; $i++) {
            $path[] = ['x' => $spawn['x'] - cos($heading) * $i * self::SEGMENT_SPACING, 'z' => $spawn['z'] - sin($heading) * $i * self::SEGMENT_SPACING];
        }
        $snake = [
            'id' => $id,
            'name' => $name,
            'skin' => self::validSkin($skin),
            'path' => $path,
            'segments' => [],
            'heading' => $heading,
            'targetHeading' => $heading,
            'length' => (float) self::START_LENGTH,
            'boosting' => false,
            'score' => 0,
            'alive' => true,
            'isBot' => $isBot,
            'respawnTick' => 0,
            'invulnTick' => $this->tick + self::SPAWN_GRACE,
        ];
        $snake['segments'] = self::sampleTrail($snake['path'], self::segmentCount($snake['length']), $heading);
        return $snake;
    }

    public function spawnBots(int $n): void
    {
        for ($i = 0; $i < $n; $i++) {
            $id = "bot-$i";
            if (isset($this->snakes[$id])) {
                continue;
            }
            $name = self::BOT_NAMES[$i % count(self::BOT_NAMES)] . ($i >= count(self::BOT_NAMES) ? ' ' . ((int) ($i / count(self::BOT_NAMES)) + 1) : '');
            $skin = self::SKINS[(int) floor($this->rand() * count(self::SKINS))]['id'];
            $this->snakes[$id] = $this->makeSnake($id, $name, $skin, true);
        }
    }

    // ── Actions ────────────────────────────────────────────────────────────────
    /** @param array<string,mixed> $action */
    public function applyAction(array $action): void
    {
        $type = $action['type'] ?? '';
        $pid = $action['playerId'] ?? '';
        switch ($type) {
            case 'join':
                if (!isset($this->snakes[$pid])) {
                    $this->snakes[$pid] = $this->makeSnake(
                        $pid,
                        substr((string) ($action['name'] ?? 'Player'), 0, 16),
                        $action['skin'] ?? self::DEFAULT_SKIN,
                        (bool) ($action['isBot'] ?? false),
                    );
                }
                break;
            case 'leave':
                if (isset($this->snakes[$pid])) {
                    $this->scatterAsFood($this->snakes[$pid]);
                    unset($this->snakes[$pid]);
                }
                break;
            case 'setHeading':
                if (isset($this->snakes[$pid]) && $this->snakes[$pid]['alive']) {
                    $this->snakes[$pid]['targetHeading'] = (float) $action['angle'];
                }
                break;
            case 'setBoost':
                if (isset($this->snakes[$pid]) && $this->snakes[$pid]['alive']) {
                    $this->snakes[$pid]['boosting'] = (bool) $action['on'];
                }
                break;
            case 'respawn':
                if (isset($this->snakes[$pid]) && !$this->snakes[$pid]['alive'] && $this->tick >= $this->snakes[$pid]['respawnTick']) {
                    $s = $this->snakes[$pid];
                    $this->snakes[$pid] = $this->makeSnake($s['id'], $s['name'], $s['skin'], $s['isBot']);
                }
                break;
        }
    }

    // ── Simulation step ──────────────────────────────────────────────────────
    public function step(): void
    {
        $this->tick++;

        for ($i = 0; $i < self::FOOD_SPAWN_PER_TICK && count($this->food) < self::AMBIENT_FOOD; $i++) {
            $this->spawnAmbientFood();
        }

        foreach ($this->snakes as $id => $s) {
            if ($s['alive'] && $s['isBot']) {
                $this->steerBot($id);
            }
        }
        foreach ($this->snakes as $id => $s) {
            if ($this->snakes[$id]['alive']) {
                $this->moveSnake($id);
            }
        }
        foreach ($this->snakes as $id => $s) {
            if ($this->snakes[$id]['alive']) {
                $this->eat($id);
            }
        }

        $dead = [];
        foreach ($this->snakes as $id => $s) {
            if ($this->snakes[$id]['alive'] && $this->collides($id)) {
                $dead[] = $id;
            }
        }
        foreach ($dead as $id) {
            $this->killSnake($id);
        }

        foreach ($this->snakes as $id => $s) {
            if ($s['isBot'] && !$this->snakes[$id]['alive'] && $this->tick >= $this->snakes[$id]['respawnTick']) {
                $this->snakes[$id] = $this->makeSnake($s['id'], $s['name'], $s['skin'], true);
            }
        }

        // Cap total food (corpse drops otherwise pile up into thousands of dots) — drop oldest.
        if (count($this->food) > self::MAX_TOTAL_FOOD) {
            $this->food = array_slice($this->food, count($this->food) - self::MAX_TOTAL_FOOD);
        }
    }

    private function moveSnake(string $id): void
    {
        $s = &$this->snakes[$id];
        $s['heading'] = self::rotateToward($s['heading'], $s['targetHeading'], self::TURN_RATE);

        $speed = self::BASE_SPEED;
        if ($s['boosting'] && $s['length'] > self::MIN_LENGTH) {
            $speed = self::BOOST_SPEED;
            if ($this->tick % self::BOOST_DRAIN_EVERY === 0) {
                $s['length'] = max(self::MIN_LENGTH, $s['length'] - 1);
                $tail = $s['segments'][count($s['segments']) - 1];
                $this->food[] = ['id' => "b-{$id}-{$this->tick}", 'x' => $tail['x'], 'z' => $tail['z'], 'value' => 1, 'r' => 0.4];
            }
        } else {
            $s['boosting'] = false;
        }

        $head = $s['path'][0];
        array_unshift($s['path'], ['x' => $head['x'] + cos($s['heading']) * $speed, 'z' => $head['z'] + sin($s['heading']) * $speed]);

        // Trim trail by arc length so long snakes always have enough to sample.
        $needLen = self::segmentCount($s['length']) * self::SEGMENT_SPACING + self::TAIL_MARGIN;
        $acc = 0.0;
        $cut = count($s['path']);
        for ($i = 1; $i < count($s['path']); $i++) {
            $acc += hypot($s['path'][$i]['x'] - $s['path'][$i - 1]['x'], $s['path'][$i]['z'] - $s['path'][$i - 1]['z']);
            if ($acc >= $needLen) {
                $cut = $i + 1;
                break;
            }
        }
        if (count($s['path']) > $cut) {
            $s['path'] = array_slice($s['path'], 0, $cut);
        }

        $s['segments'] = self::sampleTrail($s['path'], self::segmentCount($s['length']), $s['heading']);
    }

    private function eat(string $id): void
    {
        $s = &$this->snakes[$id];
        $head = $s['segments'][0];
        $kept = [];
        $gained = 0;
        foreach ($this->food as $f) {
            if (hypot($f['x'] - $head['x'], $f['z'] - $head['z']) <= self::EAT_RADIUS + $f['r']) {
                $s['score'] += $f['value'];
                $s['length'] += $f['value'];
                $gained += $f['value'];
            } else {
                $kept[] = $f;
            }
        }
        $this->food = $kept;
        // Grow FORWARD: extend the head along the heading by the gained length so new
        // segments appear behind the head and the tail stays anchored (not trailing back).
        if ($gained > 0) {
            $hx = $s['path'][0]['x'];
            $hz = $s['path'][0]['z'];
            $ext = [];
            for ($k = $gained; $k >= 1; $k--) {
                $ext[] = ['x' => $hx + cos($s['heading']) * self::SEGMENT_SPACING * $k, 'z' => $hz + sin($s['heading']) * self::SEGMENT_SPACING * $k];
            }
            $s['path'] = array_merge($ext, $s['path']);
            $s['segments'] = self::sampleTrail($s['path'], self::segmentCount($s['length']), $s['heading']);
        }
    }

    private function collides(string $id): bool
    {
        $s = $this->snakes[$id];
        $head = $s['segments'][0];
        if (hypot($head['x'], $head['z']) >= $this->arenaRadius) {
            return true;
        }
        if ($this->tick < $s['invulnTick']) {
            return false;
        }
        foreach ($this->snakes as $oid => $other) {
            if ($oid === $id || !$other['alive']) {
                continue;
            }
            foreach ($other['segments'] as $seg) {
                if (hypot($seg['x'] - $head['x'], $seg['z'] - $head['z']) <= self::HEAD_RADIUS + 0.45) {
                    return true;
                }
            }
        }
        return false;
    }

    private function killSnake(string $id): void
    {
        $s = &$this->snakes[$id];
        $this->scatterAsFood($s);
        $s['alive'] = false;
        $s['boosting'] = false;
        $s['respawnTick'] = $this->tick + self::RESPAWN_DELAY;
        $s['segments'] = [];
    }

    /** @param array<string,mixed> $s */
    private function scatterAsFood(array $s): void
    {
        for ($i = 0; $i < count($s['segments']); $i += 2) {
            $seg = $s['segments'][$i];
            $this->food[] = [
                'id' => "d-{$s['id']}-{$this->tick}-$i",
                'x' => $seg['x'] + $this->randRange(-0.4, 0.4),
                'z' => $seg['z'] + $this->randRange(-0.4, 0.4),
                'value' => 3,
                'r' => 0.7,
            ];
        }
    }

    // ── Bot AI ─────────────────────────────────────────────────────────────────
    private function steerBot(string $id): void
    {
        $s = &$this->snakes[$id];
        $head = $s['segments'][0];
        $distFromCenter = hypot($head['x'], $head['z']);
        if ($distFromCenter > $this->arenaRadius * 0.8) {
            $s['targetHeading'] = atan2(-$head['z'], -$head['x']);
            $s['boosting'] = false;
            return;
        }
        $best = null;
        $bestD = INF;
        foreach ($this->food as $f) {
            $d = hypot($f['x'] - $head['x'], $f['z'] - $head['z']);
            if ($d < $bestD && $d < 22) {
                $bestD = $d;
                $best = $f;
            }
        }
        if ($best !== null) {
            $s['targetHeading'] = atan2($best['z'] - $head['z'], $best['x'] - $head['x']);
        } elseif ($this->tick % 20 === 0) {
            $s['targetHeading'] = $this->randRange(-M_PI, M_PI);
        }
        $s['boosting'] = $best !== null && $bestD < 8 && $best['value'] >= 3 && $s['length'] > self::MIN_LENGTH + 4;
    }

    // ── Derived views ──────────────────────────────────────────────────────────
    /** @return list<array<string,mixed>> */
    public function leaderboard(int $limit = 10): array
    {
        $rows = [];
        foreach ($this->snakes as $s) {
            $rows[] = ['id' => $s['id'], 'name' => $s['name'], 'skin' => $s['skin'], 'score' => $s['score'], 'alive' => $s['alive']];
        }
        usort($rows, fn($a, $b) => $b['score'] <=> $a['score']);
        return array_slice($rows, 0, $limit);
    }

    public function playerCount(): int
    {
        $n = 0;
        foreach ($this->snakes as $s) {
            if (!$s['isBot']) {
                $n++;
            }
        }
        return $n;
    }

    /** Wire snapshot — identical field shape to the TS `toNetState()`. */
    public function toNetState(): array
    {
        $snakes = [];
        foreach ($this->snakes as $s) {
            $snakes[] = [
                'id' => $s['id'],
                'name' => $s['name'],
                'skin' => $s['skin'],
                'segments' => $s['segments'],
                'heading' => $s['heading'],
                'length' => $s['length'],
                'boosting' => $s['boosting'],
                'score' => $s['score'],
                'alive' => $s['alive'],
            ];
        }
        return [
            'tick' => $this->tick,
            'arenaRadius' => $this->arenaRadius,
            'snakes' => $snakes,
            'food' => $this->food,
        ];
    }

    // ── Deterministic replay ────────────────────────────────────────────────────
    /**
     * Rebuild exact state at $toTick from seed + external action log — mirrors replay()
     * in room.ts. @param list<array{tick:int,action:array<string,mixed>}> $events
     */
    public static function replay(string $seed, string $id, int $botCount, array $events, int $toTick): Room
    {
        $room = new Room($seed, $id);
        $room->spawnBots($botCount);
        $byTick = [];
        foreach ($events as $e) {
            $byTick[$e['tick']][] = $e['action'];
        }
        for ($t = 0; $t <= $toTick; $t++) {
            if (isset($byTick[$t])) {
                foreach ($byTick[$t] as $a) {
                    $room->applyAction($a);
                }
            }
            if ($t < $toTick) {
                $room->step();
            }
        }
        return $room;
    }

    private static function rotateToward(float $current, float $target, float $maxStep): float
    {
        $diff = $target - $current;
        while ($diff > M_PI) {
            $diff -= M_PI * 2;
        }
        while ($diff < -M_PI) {
            $diff += M_PI * 2;
        }
        if (abs($diff) <= $maxStep) {
            return $target;
        }
        return $current + ($diff < 0 ? -1 : 1) * $maxStep;
    }
}
