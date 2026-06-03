import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import { ensureTrackingVisitorId, readTrackingVisitorId } from "../http/cookies";
import type {
  FormStep,
  InstantForm,
  TrackingServerEventInput,
  TrackingServerEventPayload,
  TrackingRuntimeStepContext,
} from "../../flow";
import type { LifecycleTrackingEvent, TrackingAnswerMap } from "../../rendering";
import type { SubmissionPayload } from "../../submissions/validation";
import { getRequestId, logInstantFormEvent, type InstantFormLogger } from "../../logging";

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
    logger?: InstantFormLogger;
  },
): void {
  const server = lifecycleEvent?.config.server;
  if (!server || !lifecycleEvent) {
    return;
  }

  ensureTrackingVisitorId(c, form.tracking?.visitorId);

  const input = createTrackingServerEventInput(c, form, routeKey, lifecycleEvent.payload, options);
  logInstantFormEvent(options.logger, {
    level: "info",
    event: "tracking.server_callback_scheduled",
    requestId: getRequestId(c.req.raw),
    routeKey,
    formName: form.name,
    pageName: form.page.name,
    stepKey: options.step?.key,
    submissionId: options.submission?.submissionId,
    data: {
      trackingEvent: lifecycleEvent.payload.event,
      trackingEventId: lifecycleEvent.payload.id,
    },
  });

  queueMicrotask(() => {
    runTrackingServerCallback(server, input, {
      logger: options.logger,
      requestId: getRequestId(c.req.raw),
      routeKey,
      form,
      step: options.step,
      submission: options.submission,
      event: lifecycleEvent.payload,
    });
  });
}

function runTrackingServerCallback(
  server: NonNullable<LifecycleTrackingEvent["config"]["server"]>,
  input: TrackingServerEventInput,
  options: {
    logger?: InstantFormLogger;
    requestId: string;
    routeKey: string;
    form: InstantForm;
    step?: FormStep;
    submission?: SubmissionPayload;
    event: TrackingServerEventPayload;
  },
): void {
  try {
    const result = server(input);
    if (isPromiseLike(result)) {
      void withTimeout(result, TRACKING_SERVER_CALLBACK_TIMEOUT_MS).catch((error) => {
        logTrackingServerCallbackFailure(error, options);
      });
    }
  } catch (error) {
    logTrackingServerCallbackFailure(error, options);
  }
}

function createTrackingServerEventInput(
  c: Context,
  form: InstantForm,
  routeKey: string,
  event: TrackingServerEventPayload,
  options: {
    answers: TrackingAnswerMap;
    step?: FormStep;
    stepIndex?: number;
    submission?: SubmissionPayload;
    logger?: InstantFormLogger;
  },
): TrackingServerEventInput {
  const step = options.step ? createTrackingStepContext(options.step, options.stepIndex) : undefined;
  const userAgent = c.req.raw.headers.get("user-agent")?.trim() || undefined;
  const ip = getRequestIp(c.req.raw.headers);
  const visitorId = readTrackingVisitorId(c, form.tracking?.visitorId);

  return {
    event,
    context: form.context,
    answers: options.answers,
    cookies: {
      get: (name: string) => {
        if (name === form.tracking?.visitorId?.cookie.name && visitorId) {
          return visitorId;
        }

        return getCookie(c, name);
      },
    },
    request: {
      url: c.req.raw.url,
      headers: c.req.raw.headers,
      ...(ip ? { ip } : {}),
      ...(userAgent ? { userAgent } : {}),
    },
    ...(options.submission ? { submission: { id: options.submission.submissionId } } : {}),
    ...(step ? { step } : {}),
    ...(visitorId ? { visitor: { id: visitorId } } : {}),
    runtime: {
      requestId: getRequestId(c.req.raw),
      routeKey,
      formName: form.name,
      pageName: form.page.name,
      ...(options.step ? { stepKey: options.step.key } : {}),
      ...(options.submission ? { submissionId: options.submission.submissionId } : {}),
      ...(options.logger ? { logger: options.logger } : {}),
    },
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
  options: {
    logger?: InstantFormLogger;
    requestId: string;
    routeKey: string;
    form: InstantForm;
    step?: FormStep;
    submission?: SubmissionPayload;
    event: TrackingServerEventPayload;
  },
): void {
  const message = error instanceof Error ? error.message : String(error);

  logInstantFormEvent(options.logger, {
    level: "warn",
    event: "tracking.server_callback_failed",
    requestId: options.requestId,
    routeKey: options.routeKey,
    formName: options.form.name,
    pageName: options.form.page.name,
    stepKey: options.step?.key,
    submissionId: options.submission?.submissionId,
    data: {
      trackingEvent: options.event.event,
      trackingEventId: options.event.id,
      message,
    },
  });
}
