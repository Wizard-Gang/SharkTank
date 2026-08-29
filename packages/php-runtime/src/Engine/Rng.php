<?php

declare(strict_types=1);

namespace ModulePHP\Engine;

/**
 * Deterministic, serializable RNG — a byte-for-byte port of the TypeScript engine's
 * rng.ts (FNV-1a seed hash + mulberry32). The same seed + same call sequence produces an
 * IDENTICAL stream in PHP and JS, which is what makes cross-language game replay possible.
 *
 * The lesson: JS numbers are IEEE-754 doubles whose bitwise ops act on 32-bit ints
 * (`Math.imul`, `>>> 0`). PHP ints are 64-bit, so we emulate 32-bit wraparound by masking
 * to 0xFFFFFFFF everywhere a JS 32-bit overflow would have happened.
 */
final class Rng
{
    private const U32 = 0xFFFFFFFF;

    /** Equivalent of JS `Math.imul(a, b)`: 32×32-bit multiply, keep the low 32 bits. */
    public static function imul32(int $a, int $b): int
    {
        $a &= self::U32;
        $b &= self::U32;
        $ah = ($a >> 16) & 0xFFFF;
        $al = $a & 0xFFFF;
        $bh = ($b >> 16) & 0xFFFF;
        $bl = $b & 0xFFFF;
        return (($al * $bl) + (((($ah * $bl) + ($al * $bh)) << 16) & self::U32)) & self::U32;
    }

    /** FNV-1a hash of a string seed → uint32. Mirrors `seedToNumber()`. */
    public static function seedToNumber(string $seed): int
    {
        $hash = 2166136261;
        $len = strlen($seed);
        for ($i = 0; $i < $len; $i++) {
            $hash ^= ord($seed[$i]);
            $hash = self::imul32($hash, 16777619);
        }
        return $hash & self::U32;
    }

    /**
     * One mulberry32 step. Returns [value in [0,1), nextState (uint32)].
     * Keep nextState in the serializable game state so the whole sim stays replayable.
     *
     * @return array{0: float, 1: int}
     */
    public static function nextRandom(int $state): array
    {
        $t = ($state + 0x6D2B79F5) & self::U32;
        $r = $t;
        $r = self::imul32($r ^ ($r >> 15), $r | 1);
        $r = ($r ^ (($r + self::imul32($r ^ ($r >> 7), $r | 61)) & self::U32)) & self::U32;
        $value = ($r ^ ($r >> 14)) / 4294967296;
        return [$value, $t];
    }
}
