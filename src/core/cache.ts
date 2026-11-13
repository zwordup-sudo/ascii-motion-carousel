/** Byte-budgeted LRU: never retain all rendered frames of a large carousel. */
export class BoundedCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  bytes = 0;
  constructor(readonly limit: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, bytes: number) {
    const old = this.entries.get(key);
    if (old) { this.bytes -= old.bytes; this.entries.delete(key); }
    if (bytes > this.limit) return;
    while (this.bytes + bytes > this.limit && this.entries.size) {
      const key = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(key)!.bytes;
      this.entries.delete(key);
    }
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
  }

  clear() { this.entries.clear(); this.bytes = 0; }
}
