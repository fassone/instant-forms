import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import type {
  FormStep,
  InstantForm,
  TrackingServerEventInput,
  TrackingServerEventPayload,
  TrackingRuntimeStepContext,
} from "../../flow";
import type { LifecycleTrackingEvent, TrackingAnswerMap } from "../../rendering";
import type { SubmissionPayload } from "../../submissions/validation";

const TRACKING_SERVER_CALLBACK_TIMEOUT_MS = 5000;

export function scheduleTrackingServerCallback(
  c: Context,
  form: InstantForm,
  routeKey: string,
  lifecycleEvent: LifecycleTrackingEvent | undefined,
  options: {
    answers: TrackingAnswerMap;
    step?: FormStep;
    stepIndex?: number;
    submission?: SubmissionPayload;
  },
): void {
  const server = lifecycleEvent?.config.server;
  if (!server || !lifecycleEvent) {
    return;
  }

  const input = createTrackingServerEventInput(c, form, lifecycleEvent.payload, options);

  queueMicrotask(() => {
    runTrackingServerCallback(server, input, routeKey, lifecycleEvent.payload);
  });
}

function runTrackingServerCallback(
  server: NonNullable<LifecycleTrackingEvent["config"]["server"]>,
  input: TrackingServerEventInput,
  routeKey: string,
  event: TrackingServerEventPayload,
): void {
  try {
    const result = server(input);
    if (isPromiseLike(result)) {
      void withTimeout(result, TRACKING_SERVER_CALLBACK_TIMEOUT_MS).catch((error) => {
        logTrackingServerCallbackFailure(error, routeKey, event);
      });
    }
  } catch (error) {
    logTrackingServerCallbackFailure(error, routeKey, event);
  }
}

function createTrackingServerEventInput(
  c: Context,
  form: InstantForm,
  event: TrackingServerEventPayload,
  options: {
    answers: TrackingAnswerMap;
    step?: FormStep;
    stepIndex?: number;
    submission?: SubmissionPayload;
  },
): TrackingServerEventInput {
  const step = options.step ? createTrackingStepContext(options.step, options.stepIndex) : undefined;
  const userAgent = c.req.raw.headers.get("user-agent")?.trim() || undefined;
  const ip = getRequestIp(c.req.raw.headers);

  return {
    event,
    context: form.context,
    answers: options.answers,
    cookies: {
      get: (name: string) => getCookie(c, name),
    },
    request: {
      url: c.req.raw.url,
      headers: c.req.raw.headers,
      ...(ip ? { ip } : {}),
      ...(userAgent ? { userAgent } : {}),
    },
    ...(options.submission ? { submission: { id: options.submission.submissionId } } : {}),
    ...(step ? { step } : {}),
  };
}

function createTrackingStepContext(step: FormStep, stepIndex: number | undefined): TrackingRuntimeStepContext {
  return {
    key: step.key,
    slug: step.slug,
    kind: step.kind,
    ...(typeof stepIndex === "number" ? { index: stepIndex } : {}),
  };
}

function getRequestIp(headers: Headers): string | undefined {
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Tracking server callback timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    (timeoutId as { unref?: () => void }).unref?.();
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function logTrackingServerCallbackFailure(
  error: unknown,
  routeKey: string,
  event: TrackingServerEventPayload,
): void {
  const message = error instanceof Error ? error.message : String(error);

  console.warn("[instant-forms] tracking server callback failed", {
    routeKey,
    event: event.event,
    eventId: event.id,
    message,
  });
}
