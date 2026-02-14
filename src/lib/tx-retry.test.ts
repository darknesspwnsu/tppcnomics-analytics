import { describe, expect, it, vi } from "vitest";

import { withSerializableRetry } from "@/lib/tx-retry";

function codedError(code: string): Error & { code: string } {
  const error = new Error(`error-${code}`) as Error & { code: string };
  error.code = code;
  return error;
}

describe("withSerializableRetry", () => {
  it("retries P2034 serialization conflicts up to success", async () => {
    let attempts = 0;
    const client = {
      $transaction: vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw codedError("P2034");
        }
        return "ok";
      }),
    };

    const result = await withSerializableRetry(client as never, async () => "should-not-run", {
      maxRetries: 3,
      baseDelayMs: 0,
      maxDelayMs: 0,
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let attempts = 0;
    const client = {
      $transaction: vi.fn(async () => {
        attempts += 1;
        throw codedError("P2002");
      }),
    };

    await expect(
      withSerializableRetry(client as never, async () => "never", {
        maxRetries: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
      })
    ).rejects.toMatchObject({ code: "P2002" });

    expect(attempts).toBe(1);
  });

  it("throws after max retries are exhausted", async () => {
    let attempts = 0;
    const client = {
      $transaction: vi.fn(async () => {
        attempts += 1;
        throw codedError("P2034");
      }),
    };

    await expect(
      withSerializableRetry(client as never, async () => "never", {
        maxRetries: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
      })
    ).rejects.toMatchObject({ code: "P2034" });

    expect(attempts).toBe(2);
  });
});
