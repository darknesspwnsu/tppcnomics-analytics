import { Prisma } from "@prisma/client";

export type SerializableRetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

type TransactionRunner = {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<T>;
};

const RETRYABLE_ERROR_CODE = "P2034";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 25;
const DEFAULT_MAX_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableSerializationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === RETRYABLE_ERROR_CODE;
}

export async function withSerializableRetry<T>(
  client: TransactionRunner,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: SerializableRetryOptions = {}
): Promise<T> {
  const maxRetries = Math.max(0, Math.trunc(Number(options.maxRetries ?? DEFAULT_MAX_RETRIES)));
  const baseDelayMs = Math.max(0, Math.trunc(Number(options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS)));
  const maxDelayMs = Math.max(baseDelayMs, Math.trunc(Number(options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS)));

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.$transaction((tx) => fn(tx), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableSerializationError(error) || attempt >= maxRetries) {
        throw error;
      }

      const exponential = baseDelayMs * 2 ** attempt;
      const jitter = baseDelayMs > 0 ? Math.floor(Math.random() * baseDelayMs) : 0;
      const delayMs = Math.min(maxDelayMs, exponential + jitter);
      await sleep(delayMs);
    }
  }
}
