export class RateLimiter {
  private lastRequest: Map<string, number> = new Map();
  private perDomainDelays: Map<string, number> = new Map();
  /** Serializes concurrent waiters per hostname so delays stack correctly. */
  private chains: Map<string, Promise<void>> = new Map();
  private defaultDelayMs: number;

  constructor(defaultDelayMs: number = 1000) {
    this.defaultDelayMs = defaultDelayMs;
  }

  setDomainDelay(hostname: string, delayMs: number): void {
    this.perDomainDelays.set(hostname, delayMs);
  }

  private getEffectiveDelay(hostname: string): number {
    return this.perDomainDelays.get(hostname) ?? this.defaultDelayMs;
  }

  async waitForSlot(url: string): Promise<void> {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return;
    }

    const previous = this.chains.get(hostname) ?? Promise.resolve();

    const run = async (): Promise<void> => {
      const delay = this.getEffectiveDelay(hostname);
      const now = Date.now();
      const last = this.lastRequest.get(hostname) ?? 0;
      const remaining = delay - (now - last);

      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }

      this.lastRequest.set(hostname, Date.now());
    };

    // Chain after previous waiter; recover if a prior waiter rejected
    const current = previous.then(run, run);
    this.chains.set(hostname, current);

    try {
      await current;
    } finally {
      // Drop the chain once this waiter finishes if nothing newer was chained
      if (this.chains.get(hostname) === current) {
        this.chains.delete(hostname);
      }
    }
  }
}
