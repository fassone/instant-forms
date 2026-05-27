import type { DeliveryPayload } from "./validation";

export type DeliveryFetch = (url: string, init: RequestInit) => Promise<Response> | Response;
export type DeliveryDelay = (milliseconds: number) => Promise<void> | void;

export type DeliveryOptions = {
  fetch?: DeliveryFetch;
  delay?: DeliveryDelay;
  maxAttempts?: number;
  retryDelayMs?: number;
};

export type DeliveryResult =
  | {
      ok: true;
      attempts: number;
      status: number;
    }
  | {
      ok: false;
      attempts: number;
      status?: number;
      error?: string;
    };

const defaultMaxAttempts = 4;
const defaultRetryDelayMs = 2000;

export async function deliverPayload(delivery: DeliveryPayload, options: DeliveryOptions = {}): Promise<DeliveryResult> {
  const fetcher = options.fetch ?? ((url, init) => fetch(url, init));
  const delay = options.delay ?? delayMilliseconds;
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher(delivery.url, createDeliveryRequestInit(delivery));
      lastStatus = response.status;

      if (response.ok) {
        return { ok: true, attempts: attempt, status: response.status };
      }

      lastError = `Downstream delivery returned HTTP ${response.status}.`;
    } catch (error) {
      lastStatus = undefined;
      lastError = error instanceof Error ? error.message : "Downstream delivery failed.";
    }

    if (attempt < maxAttempts) {
      await delay(retryDelayMs);
    }
  }

  return {
    ok: false,
    attempts: maxAttempts,
    ...(lastStatus !== undefined ? { status: lastStatus } : {}),
    ...(lastError ? { error: lastError } : {}),
  };
}

function createDeliveryRequestInit(delivery: DeliveryPayload): RequestInit {
  if (delivery.encoding === "form_urlencoded") {
    return {
      method: delivery.method,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(delivery.payload).toString(),
    };
  }

  return {
    method: delivery.method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(delivery.payload),
  };
}

function delayMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
