<?php

declare(strict_types=1);

namespace ModulePHP\Store;

/**
 * BlobStore backed by JSON files under a data directory. Keys map to file paths (slashes
 * become nested directories). This is also how the game (WS) worker and the HTTP worker
 * share state: the game worker writes lobby/status/audit snapshots here, the HTTP worker
 * reads them — the same "one storage seam" idea as the Cloudflare version, minus the DO.
 */
final class FileBlobStore implements BlobStore
{
    public function __construct(private readonly string $root)
    {
        if (!is_dir($root)) {
            mkdir($root, 0777, true);
        }
    }

    private function path(string $key): string
    {
        $safe = str_replace(['..', "\0"], '', $key);
        return $this->root . '/' . $safe;
    }

    public function get(string $key): ?string
    {
        $p = $this->path($key);
        if (!is_file($p)) {
            return null;
        }
        $data = file_get_contents($p);
        return $data === false ? null : $data;
    }

    public function put(string $key, string $value): void
    {
        $p = $this->path($key);
        $dir = dirname($p);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        // Atomic-ish write so a concurrent reader never sees a half-written file.
        $tmp = $p . '.' . getmypid() . '.tmp';
        file_put_contents($tmp, $value, LOCK_EX);
        rename($tmp, $p);
    }

    public function delete(string $key): void
    {
        $p = $this->path($key);
        if (is_file($p)) {
            unlink($p);
        }
    }

    public function list(string $prefix = ''): array
    {
        $base = $this->root;
        if (!is_dir($base)) {
            return [];
        }
        $out = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($base, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            if (!$file->isFile()) {
                continue;
            }
            $key = substr($file->getPathname(), strlen($base) + 1);
            if ($prefix === '' || str_starts_with($key, $prefix)) {
                $out[] = $key;
            }
        }
        sort($out);
        return $out;
    }

    public function getJson(string $key): mixed
    {
        $raw = $this->get($key);
        return $raw === null ? null : json_decode($raw, true);
    }

    public function putJson(string $key, mixed $value): void
    {
        $this->put($key, json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }
}
