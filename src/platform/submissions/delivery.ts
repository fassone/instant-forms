import type { DeliveryPayload } from "./validation";
import { logInstantFormEvent, type InstantFormLogger, type InstantFormLogRecord } from "../logging";

export type DeliveryFetch = (url: string, init: RequestInit) => Promise<Response> | Response;
export type DeliveryDelay = (milliseconds: number) => Promise<void> | void;
export type DeliveryLogContext = Pick<
  InstantFormLogRecord,
  "requestId" | "routeKey" | "formName" | "pageName" | "submissionId"
> & {
  data?: Record<string, unknown>;
};

export type DeliveryOptions = {
  fetch?: DeliveryFetch;
  delay?: DeliveryDelay;
  maxAttempts?: number;
  retryDelayMs?: number;
  logger?: InstantFormLogger;
  logContext?: DeliveryLogContext;
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
  const logger = options.logger;
  const logContext = options.logContext;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const response = await fetcher(delivery.url, createDeliveryRequestInit(delivery));
      lastStatus = response.status;
      const durationMs = Date.now() - attemptStartedAt;

      logDeliveryEvent(logger, logContext, {
        level: response.ok ? "info" : "warn",
        event: response.ok ? "lead.delivery_attempt_succeeded" : "lead.delivery_attempt_failed",
        status: response.status,
        durationMs,
        data: {
          url: delivery.url,
          method: delivery.method,
          encoding: delivery.encoding,
          attempt,
          maxAttempts,
          status: response.status,
        },
      });

      if (response.ok) {
        logDeliveryEvent(logger, logContext, {
          level: "info",
          event: "lead.delivery_succeeded",
          status: response.status,
          durationMs,
          data: {
            ...logContext?.data,
            delivery,
            attempts: attempt,
            status: response.status,
          },
        });

        return { ok: true, attempts: attempt, status: response.status };
      }

      lastError = `Downstream delivery returned HTTP ${response.status}.`;
    } catch (error) {
      lastStatus = undefined;
      lastError = error instanceof Error ? error.message : "Downstream delivery failed.";
      const durationMs = Date.now() - attemptStartedAt;

      logDeliveryEvent(logger, logContext, {
        level: "warn",
        event: "lead.delivery_attempt_failed",
        durationMs,
        data: {
          url: delivery.url,
          method: delivery.method,
          encoding: delivery.encoding,
          attempt,
          maxAttempts,
          error: lastError,
        },
      });
    }

    if (attempt < maxAttempts) {
      await delay(retryDelayMs);
    }
  }

  logDeliveryEvent(logger, logContext, {
    level: "error",
    event: "lead.delivery_failed",
    status: lastStatus,
    critical: true,
    data: {
      ...logContext?.data,
      delivery,
      attempts: maxAttempts,
      ...(lastStatus !== undefined ? { status: lastStatus } : {}),
      ...(lastError ? { error: lastError } : {}),
    },
  });

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

function logDeliveryEvent(
  logger: InstantFormLogger | undefined,
  context: DeliveryLogContext | undefined,
  record: Pick<InstantFormLogRecord, "level" | "event" | "status" | "durationMs" | "critical" | "data">,
): void {
  logInstantFormEvent(logger, {
    ...context,
    ...record,
  });
}
