export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitter: boolean;
}

const DEFAULTS: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: true,
};

export function resolveRetryOptions(options?: Partial<RetryOptions>): RetryOptions {
  return { ...DEFAULTS, ...options };
}

export function computeBackoffDelay(
  attempt: number,
  options?: Partial<RetryOptions>,
): number {
  const opts = resolveRetryOptions(options);
  const delay = opts.baseDelayMs * Math.pow(opts.factor, attempt - 1);
  const capped = Math.min(delay, opts.maxDelayMs);

  if (!opts.jitter) return capped;

  return capped * (0.5 + Math.random() * 0.5);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
  onRetry?: (err: Error, attempt: number, delayMs: number) => void,
): Promise<T> {
  const opts = resolveRetryOptions(options);

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === opts.maxAttempts) {
        throw err;
      }
      const delayMs = computeBackoffDelay(attempt, options);
      if (onRetry) {
        onRetry(err as Error, attempt, delayMs);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Unreachable");
}

export function isRetryableError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;

    if (code === "INVALID_URL" || code === "NOT_HTML") return false;

    if (code === "HTTP_ERROR") {
      const status = (err as { statusCode?: number }).statusCode;
      if (status !== undefined && status < 500 && status !== 429) return false;
      return true;
    }

    if (code === "TIMEOUT" || code === "NETWORK") return true;
  }

  if (err && typeof err === "object") {
    const msg = (err as Error).message?.toLowerCase() ?? "";
    if (
      msg.includes("connect econnrefused") ||
      msg.includes("connection terminated") ||
      msg.includes("prisma") ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("enotfound") ||
      msg.includes("etimedout")
    ) {
      return true;
    }
  }

  return true;
}
