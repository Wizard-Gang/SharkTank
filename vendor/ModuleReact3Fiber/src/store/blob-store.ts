// Generic blob store — the one storage seam the game talks to.
// Local dev uses MemoryBlobStore; later, drop-in implementations backed by
// Cloudflare R2 / KV / D1 satisfy the same interface without touching game code.
// (Mirrors the blob-store abstraction from the previous module-runtime.)

export interface BlobStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** JSON convenience layer over any BlobStore. */
export class JsonStore {
  constructor(private readonly blobs: BlobStore) {}

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.blobs.get(key);
    if (!raw) return null;
    return JSON.parse(dec.decode(raw)) as T;
  }

  async putJSON(key: string, value: unknown): Promise<void> {
    await this.blobs.put(key, enc.encode(JSON.stringify(value)));
  }

  delete(key: string): Promise<void> {
    return this.blobs.delete(key);
  }

  list(prefix?: string): Promise<string[]> {
    return this.blobs.list(prefix);
  }
}
