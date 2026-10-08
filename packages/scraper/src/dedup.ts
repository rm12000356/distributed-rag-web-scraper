import { createHash } from "node:crypto";

export function contentHash(content: string): string {
  const normalized = content.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized, "utf-8").digest("hex");
}

const MAX_HASHES = 50_000;

export class DedupChecker {
  private seenHashes: Map<string, number>;
  private insertionOrder: string[];

  constructor() {
    this.seenHashes = new Map();
    this.insertionOrder = [];
  }

  isDuplicate(content: string): boolean {
    const hash = contentHash(content);
    return this.seenHashes.has(hash);
  }

  markAsSeen(content: string): void {
    const hash = contentHash(content);
    if (this.seenHashes.has(hash)) return;

    if (this.seenHashes.size >= MAX_HASHES) {
      const oldest = this.insertionOrder.shift();
      if (oldest) this.seenHashes.delete(oldest);
    }

    this.seenHashes.set(hash, Date.now());
    this.insertionOrder.push(hash);
  }
}
