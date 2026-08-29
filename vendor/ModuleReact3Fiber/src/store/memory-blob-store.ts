import type { BlobStore } from "./blob-store.js";

/**
 * In-memory BlobStore for local dev. State lives for the life of the process
 * (so it persists across requests in `wrangler dev`, and resets when `npm run local`
 * tears things down). Swap for an R2/KV/D1-backed store when porting to Workers.
 */
export class MemoryBlobStore implements BlobStore {
  private readonly map = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | null> {
    return this.map.get(key) ?? null;
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async list(prefix = ""): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}
