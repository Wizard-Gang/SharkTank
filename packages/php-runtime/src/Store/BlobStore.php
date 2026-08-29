<?php

declare(strict_types=1);

namespace ModulePHP\Store;

/**
 * The one storage seam the game talks to — mirrors the TypeScript `BlobStore` interface.
 * Swap FileBlobStore for a PDO/SQLite or Redis implementation without touching game code.
 */
interface BlobStore
{
    public function get(string $key): ?string;

    public function put(string $key, string $value): void;

    public function delete(string $key): void;

    /** @return string[] keys with the given prefix, sorted. */
    public function list(string $prefix = ''): array;

    /** @return mixed decoded JSON, or null if absent. */
    public function getJson(string $key): mixed;

    public function putJson(string $key, mixed $value): void;
}
