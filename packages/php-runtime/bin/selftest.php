<?php

declare(strict_types=1);

/**
 * Proves the byte-identical core without any dependencies:
 *   1. The RNG matches the TypeScript engine bit-for-bit (reference vectors captured
 *      from the live TS backend).
 *   2. The engine replays deterministically (same seed + actions ⇒ identical state).
 *
 * Run:  php bin/selftest.php     (no Composer needed — pulls in the Engine directly)
 */

require __DIR__ . '/../src/Engine/Rng.php';
require __DIR__ . '/../src/Engine/Room.php';

use ModulePHP\Engine\Rng;
use ModulePHP\Engine\Room;

$fail = 0;
function check(string $label, bool $ok): void
{
    global $fail;
    echo ($ok ? "  \e[32m✓\e[0m " : "  \e[31m✗\e[0m ") . $label . "\n";
    if (!$ok) {
        $fail++;
    }
}

echo "RNG parity with the TypeScript engine (seed \"seed-fixed\"):\n";
$seed = Rng::seedToNumber('seed-fixed');
check("seedToNumber == 3325626751 (got $seed)", $seed === 3325626751);

// Reference vectors captured from the live TS backend: [state_in, value, state_out].
$vectors = [
    [3325626751, 0.41762211732566357, 862225268],
    [862225268, 0.545886108186096, 2693791081],
    [2693791081, 0.1901917930226773, 230389598],
];
foreach ($vectors as $i => [$in, $expectVal, $expectState]) {
    [$v, $next] = Rng::nextRandom($in);
    check("nextRandom($in) value matches TS", abs($v - $expectVal) < 1e-15);
    check("nextRandom($in) state == $expectState (got $next)", $next === $expectState);
}

echo "\nDeterministic replay:\n";
// Build a game log, then replay it twice — the reconstructed states must be identical.
$events = [
    ['tick' => 0, 'action' => ['type' => 'join', 'playerId' => 'p1', 'name' => 'Test', 'skin' => 'cyan']],
    ['tick' => 10, 'action' => ['type' => 'setHeading', 'playerId' => 'p1', 'angle' => 1.2]],
    ['tick' => 40, 'action' => ['type' => 'setBoost', 'playerId' => 'p1', 'on' => true]],
    ['tick' => 80, 'action' => ['type' => 'setHeading', 'playerId' => 'p1', 'angle' => -0.6]],
];
$a = Room::replay('seed-room-1', 'room-1', 23, $events, 200)->toNetState();
$b = Room::replay('seed-room-1', 'room-1', 23, $events, 200)->toNetState();
$ja = json_encode($a, JSON_UNESCAPED_SLASHES);
$jb = json_encode($b, JSON_UNESCAPED_SLASHES);
check("two replays at tick 200 are byte-identical", $ja === $jb);
check("replayed state has 24 snakes", count($a['snakes']) === 24);
check("rollback (tick 50) differs from tick 200", json_encode(Room::replay('seed-room-1', 'room-1', 23, $events, 50)->toNetState()) !== $ja);

echo "\n" . ($fail === 0 ? "\e[32mAll checks passed.\e[0m\n" : "\e[31m$fail check(s) failed.\e[0m\n");
exit($fail === 0 ? 0 : 1);
