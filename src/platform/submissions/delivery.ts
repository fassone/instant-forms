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

type DeliveryResponseDiagnostics = {
  responseBody?: string;
  responseBodyTruncated?: true;
  responseBodyReadError?: string;
  responseContentType?: string;
};

export type DeliveryOptions = {
  fetch?: DeliveryFetch;
  delay?: DeliveryDelay;
  maxAttempts?: number;
  retryDelayMs?: number;
  attemptTimeoutMs?: number;
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
const defaultAttemptTimeoutMs = 8000;
const responseBodyPreviewLimitBytes = 8192;

export async function deliverPayload(delivery: DeliveryPayload, options: DeliveryOptions = {}): Promise<DeliveryResult> {
  const fetcher = options.fetch ?? ((url, init) => fetch(url, init));
  const delay = options.delay ?? delayMilliseconds;
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;
  const attemptTimeoutMs = getPositiveNumberOption(options.attemptTimeoutMs, defaultAttemptTimeoutMs);
  const logger = options.logger;
  const logContext = options.logContext;
  let lastStatus: number | undefined;
  let lastError: string | undefined;
  let lastResponseDiagnostics: DeliveryResponseDiagnostics | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    logDeliveryEvent(logger, logContext, {
      level: "info",
      event: "lead.delivery_attempt_started",
      data: {
        url: delivery.url,
        method: delivery.method,
        encoding: delivery.encoding,
        attempt,
        maxAttempts,
        attemptTimeoutMs,
      },
    });

    try {
      const { response, responseDiagnostics } = await runDeliveryAttempt(
        fetcher,
        delivery.url,
        createDeliveryRequestInit(delivery),
        attemptTimeoutMs,
      );
      lastStatus = response.status;
      lastResponseDiagnostics = responseDiagnostics;
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
          ...responseDiagnostics,
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
            ...responseDiagnostics,
          },
        });

        return { ok: true, attempts: attempt, status: response.status };
      }

      lastError = `Downstream delivery returned HTTP ${response.status}.`;
    } catch (error) {
      lastStatus = undefined;
      lastResponseDiagnostics = undefined;
      lastError = getDeliveryErrorMessage(error);
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
      ...lastResponseDiagnostics,
    },
  });

  return {
    ok: false,
    attempts: maxAttempts,
    ...(lastStatus !== undefined ? { status: lastStatus } : {}),
    ...(lastError ? { error: lastError } : {}),
  };
}

async function runDeliveryAttempt(
  fetcher: DeliveryFetch,
  url: string,
  init: RequestInit,
  attemptTimeoutMs: number,
): Promise<{ response: Response; responseDiagnostics: DeliveryResponseDiagnostics }> {
  const abortController = new AbortController();
  const timeoutMessage = getDeliveryTimeoutMessage(attemptTimeoutMs);
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      reject(new Error(timeoutMessage));
    }, attemptTimeoutMs);
    (timeoutId as { unref?: () => void }).unref?.();
  });

  try {
    const deliveryAttempt = Promise.resolve(fetcher(url, { ...init, signal: abortController.signal })).then(async (response) => ({
      response,
      responseDiagnostics: await readResponseDiagnostics(response),
    }));
    return await Promise.race([deliveryAttempt, timeoutPromise]);
  } catch (error) {
    if (timedOut) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function readResponseDiagnostics(response: Response): Promise<DeliveryResponseDiagnostics> {
  const responseContentType = response.headers.get("content-type")?.trim() || undefined;
  const diagnostics: DeliveryResponseDiagnostics = {
    ...(responseContentType ? { responseContentType } : {}),
  };

  if (!response.body) {
    return diagnostics;
  }

  try {
    const preview = await readResponseBodyPreview(response.body, responseBodyPreviewLimitBytes);
    return {
      ...diagnostics,
      ...(preview.body ? { responseBody: preview.body } : {}),
      ...(preview.truncated ? { responseBodyTruncated: true } : {}),
    };
  } catch (error) {
    return {
      ...diagnostics,
      responseBodyReadError: getDeliveryErrorMessage(error),
    };
  }
}

async function readResponseBodyPreview(
  body: ReadableStream<Uint8Array>,
  limitBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;

  try {
    while (totalBytes < limitBytes) {
      const result = await reader.read();
      if (result.done) {
        return { body: decodeByteChunks(chunks, totalBytes), truncated };
      }

      const chunk = result.value;
      const remainingBytes = limitBytes - totalBytes;
      if (chunk.byteLength > remainingBytes) {
        chunks.push(chunk.slice(0, remainingBytes));
        totalBytes += remainingBytes;
        truncated = true;
        await reader.cancel().catch(() => undefined);
        return { body: decodeByteChunks(chunks, totalBytes), truncated };
      }

      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }

    const overflowProbe = await reader.read();
    if (!overflowProbe.done) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
    }

    return { body: decodeByteChunks(chunks, totalBytes), truncated };
  } finally {
    reader.releaseLock();
  }
}

function decodeByteChunks(chunks: Uint8Array[], totalBytes: number): string {
  if (totalBytes === 0) {
    return "";
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
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

function getPositiveNumberOption(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function getDeliveryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Downstream delivery failed.";
}

function getDeliveryTimeoutMessage(attemptTimeoutMs: number): string {
  return `Downstream delivery timed out after ${attemptTimeoutMs}ms.`;
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
