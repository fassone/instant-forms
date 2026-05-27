import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";

import {
  canAccessStep,
  getNextStepIndex,
  getResumeStepIndex,
  sanitizeCheckpointAnswers,
  validateCheckpointAnswer,
} from "../../persistence/checkpoints";
import {
  getStepByKey,
  canResolveStepDynamicValues,
  hasStepDynamicResolvers,
  isCountedStep,
  isStepVisible,
  type FormStep,
  type InstantForm,
} from "../../flow";
import {
  getFormRouteByRouteKey,
  getFormRoutePostSubmitUrl,
  getFormRouteStepUrl,
  type FormRoutes,
} from "../../routing";
import {
  validateSubmission,
  type JsonPayloadValue,
  type SubmissionMappingContext,
  type SubmissionPayload,
} from "../../submissions/validation";
import { deliverPayload, type DeliveryOptions } from "../../submissions/delivery";
import {
  createLifecycleTrackingEvent,
  createLifecycleTrackingPayload,
  createResolvedStepPayload,
  renderGoogleTagManagerHead,
  type MetaBrowserIds,
} from "../../rendering";
import { createClientFormConfig } from "../../rendering/client/config";
import {
  clearCheckpointAnswers,
  readCheckpointAnswers,
  setCheckpointAnswers,
  setPostSubmitState,
} from "../http/cookies";
import { htmlResponse, jsonResponse, redirectNoStore } from "../http/responses";
import { scheduleTrackingServerCallback } from "../tracking/server-effects";

export type SubmissionLogger = (payload: SubmissionPayload) => void;

type NativeFormData = {
  entries(): IterableIterator<[string, unknown]>;
  get(name: string): unknown;
};

export function registerFormRoutes(
  app: Hono,
  routes: FormRoutes,
  logger: SubmissionLogger,
  deliveryOptions: DeliveryOptions = {},
): void {
  app.post("/api/forms/:routeKey/checkpoints", async (c) => {
    const routeKey = c.req.param("routeKey");
    const routeEntry = getFormRouteByRouteKey(routes, routeKey);

    if (!routeEntry) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "routeKey", message: "Form route is not available." }] },
        404,
      );
    }

    const { form } = routeEntry;
    const body = await parseJsonBody(c.req.raw);

    if (!body.ok || !isRecord(body.value)) {
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: form.ui.errors.checkpointSaveFailed }] }, 400);
    }

    const questionKey = typeof body.value.questionKey === "string" ? body.value.questionKey : "";
    const stepDefinition = getStepByKey(form, questionKey);

    if (!stepDefinition) {
      return jsonResponse(c, { ok: false, errors: [{ field: "questionKey", message: form.ui.errors.unavailableQuestion }] }, 404);
    }

    const answers = readCheckpointAnswers(c, form, routeEntry.routeKey);
    const stepIndex = form.steps.findIndex((candidate) => candidate.key === stepDefinition.key);

    if (stepDefinition.kind === "interstitial" && (stepIndex === -1 || !canAccessStep(form, stepIndex, answers))) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: form.ui.errors.unavailableQuestion }] }, 400);
    }

    const requestedAnswer = typeof body.value.answer === "string" ? body.value.answer.trim() : "";

    if (
      stepDefinition.kind === "interstitial" &&
      requestedAnswer === stepDefinition.seenAnswer &&
      answers[stepDefinition.key] !== stepDefinition.completionAnswer &&
      answers[stepDefinition.key] !== stepDefinition.seenAnswer
    ) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: form.ui.errors.incompleteStep }] }, 400);
    }

    if (!isStepVisible(stepDefinition, answers)) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: form.ui.errors.unavailableQuestion }] }, 400);
    }

    const validation = validateCheckpointAnswer(form, stepDefinition, body.value.answer);

    if (!validation.ok) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: validation.message }] }, 400);
    }

    answers[stepDefinition.key] = validation.answer;
    const sanitizedAnswers = sanitizeCheckpointAnswers(form, answers);
    setCheckpointAnswers(c, routeEntry.routeKey, sanitizedAnswers);

    const nextIndex =
      stepDefinition.kind === "interstitial" && validation.answer === stepDefinition.completionAnswer
        ? stepIndex
        : stepIndex === -1
          ? getResumeStepIndex(form, sanitizedAnswers)
          : getNextStepIndex(form, stepIndex, sanitizedAnswers);
    const nextStep = getStepAt(form, nextIndex);
    const nextStepPayload =
      hasStepDynamicResolvers(nextStep) && canResolveStepDynamicValues(form, nextStep, sanitizedAnswers)
        ? createResolvedStepPayload(form, nextIndex, sanitizedAnswers, (step) =>
            getFormRouteStepUrl(routeEntry.routeSegments, step),
          )
        : undefined;
    const trackingEvents = createCheckpointTrackingEvents(
      c,
      form,
      routeEntry.routeKey,
      getFormRouteStepUrl(routeEntry.routeSegments, stepDefinition),
      stepDefinition,
      stepIndex,
      sanitizedAnswers,
      getJsonMetaBrowserIds(body.value),
    );

    return jsonResponse(
      c,
      {
        ok: true,
        nextUrl: getFormRouteStepUrl(routeEntry.routeSegments, nextStep),
        answers: sanitizedAnswers,
        ...(nextStepPayload ? { nextStep: nextStepPayload } : {}),
        ...(trackingEvents.length > 0 ? { trackingEvents } : {}),
      },
      200,
    );
  });

  app.post("/api/forms/:routeKey/resolutions", async (c) => {
    const routeKey = c.req.param("routeKey");
    const routeEntry = getFormRouteByRouteKey(routes, routeKey);

    if (!routeEntry) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "routeKey", message: "Form route is not available." }] },
        404,
      );
    }

    const body = await parseJsonBody(c.req.raw);

    if (!body.ok || !isRecord(body.value)) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "body", message: routeEntry.form.ui.errors.stepResolutionFailed }] },
        400,
      );
    }

    const stepKey = typeof body.value.stepKey === "string" ? body.value.stepKey : "";
    const stepDefinition = getStepByKey(routeEntry.form, stepKey);

    if (!stepDefinition) {
      return jsonResponse(c, { ok: false, errors: [{ field: "stepKey", message: routeEntry.form.ui.errors.unavailableQuestion }] }, 404);
    }

    const answerSnapshot = isRecord(body.value.answers) ? body.value.answers : {};
    const sanitizedAnswers = sanitizeCheckpointAnswers(routeEntry.form, answerSnapshot);
    const stepIndex = routeEntry.form.steps.findIndex((candidate) => candidate.key === stepDefinition.key);

    if (stepIndex === -1 || !canAccessStep(routeEntry.form, stepIndex, sanitizedAnswers)) {
      return jsonResponse(c, { ok: false, reason: "step_not_ready" }, 202);
    }

    if (hasStepDynamicResolvers(stepDefinition) && !canResolveStepDynamicValues(routeEntry.form, stepDefinition, sanitizedAnswers)) {
      return jsonResponse(c, { ok: false, reason: "dependencies_not_ready" }, 202);
    }

    try {
      return jsonResponse(
        c,
        {
          ok: true,
          step: createResolvedStepPayload(routeEntry.form, stepIndex, sanitizedAnswers, (step) =>
            getFormRouteStepUrl(routeEntry.routeSegments, step),
          ),
        },
        200,
      );
    } catch (error) {
      return jsonResponse(
        c,
        {
          ok: false,
          errors: [
            {
              field: stepDefinition.key,
              message: error instanceof Error ? error.message : routeEntry.form.ui.errors.stepResolutionFailed,
            },
          ],
        },
        400,
      );
    }
  });

  app.post("/api/forms/:routeKey/tracking-events", async (c) => {
    const routeKey = c.req.param("routeKey");
    const routeEntry = getFormRouteByRouteKey(routes, routeKey);

    if (!routeEntry) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "routeKey", message: "Form route is not available." }] },
        404,
      );
    }

    const body = await parseJsonBody(c.req.raw);

    if (!body.ok || !isRecord(body.value)) {
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: routeEntry.form.ui.errors.submissionFailed }] }, 400);
    }

    const eventKind = typeof body.value.eventKind === "string" ? body.value.eventKind : "";
    if (eventKind !== "trustedFormSubstepView") {
      return jsonResponse(c, { ok: false, errors: [{ field: "eventKind", message: "Tracking event is not available." }] }, 400);
    }

    const stepKey = typeof body.value.stepKey === "string" ? body.value.stepKey : "";
    const stepDefinition = getStepByKey(routeEntry.form, stepKey);
    if (!stepDefinition || stepDefinition.kind !== "trusted_form_consent") {
      return jsonResponse(c, { ok: false, errors: [{ field: "stepKey", message: routeEntry.form.ui.errors.unavailableQuestion }] }, 404);
    }

    const stepIndex = routeEntry.form.steps.findIndex((candidate) => candidate.key === stepDefinition.key);
    const answerSnapshot = isRecord(body.value.answers) ? body.value.answers : {};
    const checkpointAnswers = readCheckpointAnswers(c, routeEntry.form, routeEntry.routeKey);
    const sanitizedAnswers = sanitizeCheckpointAnswers(routeEntry.form, { ...checkpointAnswers, ...answerSnapshot });

    if (stepIndex === -1 || !canAccessStep(routeEntry.form, stepIndex, sanitizedAnswers)) {
      return jsonResponse(c, { ok: false, errors: [{ field: "stepKey", message: routeEntry.form.ui.errors.unavailableQuestion }] }, 400);
    }

    const trustedFormSubstep = body.value.trustedFormSubstep === "consent" ? "consent" : "review";
    const trackingEvents = createTrustedFormSubstepTrackingEvents(
      c,
      routeEntry.form,
      routeEntry.routeKey,
      getFormRouteStepUrl(routeEntry.routeSegments, stepDefinition),
      stepDefinition,
      stepIndex,
      trustedFormSubstep,
      sanitizedAnswers,
      getJsonMetaBrowserIds(body.value),
    );

    return jsonResponse(c, { ok: true, trackingEvents }, 200);
  });

  app.post("/api/forms/:routeKey/submissions", async (c) => {
    const routeKey = c.req.param("routeKey");
    const routeEntry = getFormRouteByRouteKey(routes, routeKey);

    if (!routeEntry) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "routeKey", message: "Form route is not available." }] },
        404,
      );
    }

    const body = await parseJsonBody(c.req.raw);

    if (!body.ok) {
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: routeEntry.form.ui.errors.submissionFailed }] }, 400);
    }

    const browserIds = getJsonMetaBrowserIds(body.value);
    const validation = validateSubmission(
      routeEntry.form,
      routeEntry.routeKey,
      body.value,
      undefined,
      undefined,
      createSubmissionMappingContext(c, browserIds),
    );

    if (validation.ok === false) {
      return jsonResponse(c, { ok: false, errors: validation.errors }, 400);
    }

    const delivery = await deliverPayload(validation.payload.delivery, deliveryOptions);
    if (!delivery.ok) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "delivery", message: routeEntry.form.ui.errors.submissionFailed }] },
        502,
      );
    }

    logger(validation.payload);
    clearCheckpointAnswers(c, routeEntry.routeKey);

    const trackingEvents = createNativeSubmissionTrackingEvents(
      c,
      routeEntry.form,
      routeEntry.routeKey,
      validation.payload,
      browserIds,
    );

    return jsonResponse(
      c,
      {
        ok: true,
        submittedAt: validation.payload.submittedAt,
        trackingEvents,
      },
      201,
    );
  });

  app.post("/api/forms/:routeKey/native-submissions", async (c) => {
    const routeKey = c.req.param("routeKey");
    const routeEntry = getFormRouteByRouteKey(routes, routeKey);

    if (!routeEntry) {
      return htmlResponse(renderNativeSubmissionErrorPage(["Form route is not available."]), 404, "no-store");
    }

    const formDataResult = await parseFormData(c.req.raw);
    if (!formDataResult.ok) {
      return htmlResponse(
        renderNativeSubmissionErrorPage(routeEntry.form, routeEntry.routeKey, [routeEntry.form.ui.errors.submissionFailed]),
        400,
        "no-store",
      );
    }

    const checkpointAnswers = readCheckpointAnswers(c, routeEntry.form, routeEntry.routeKey);
    const postedAnswers = getNativeSubmissionAnswers(formDataResult.value);
    const trustedFormCertUrl = getNativeTrustedFormCertUrl(routeEntry.form, formDataResult.value);
    const browserIds = createNativeSubmissionMetaBrowserIds(c, formDataResult.value);
    const validation = validateSubmission(routeEntry.form, routeEntry.routeKey, {
      answers: {
        ...checkpointAnswers,
        ...postedAnswers,
      },
      trustedFormCertUrl,
    }, undefined, undefined, createSubmissionMappingContext(c, browserIds));

    if (validation.ok === false) {
      return htmlResponse(
        renderNativeSubmissionErrorPage(routeEntry.form, routeEntry.routeKey, validation.errors.map((error) => error.message)),
        400,
        "no-store",
      );
    }

    const delivery = await deliverPayload(validation.payload.delivery, deliveryOptions);
    if (!delivery.ok) {
      return htmlResponse(
        renderNativeSubmissionErrorPage(routeEntry.form, routeEntry.routeKey, [routeEntry.form.ui.errors.submissionFailed]),
        502,
        "no-store",
      );
    }

    logger(validation.payload);
    clearCheckpointAnswers(c, routeEntry.routeKey);
    const trackingEvents = createNativeSubmissionTrackingEvents(
      c,
      routeEntry.form,
      routeEntry.routeKey,
      validation.payload,
      browserIds,
    );
    setPostSubmitState(c, routeEntry.routeKey, {
      trackingEvents,
      stepCountLabel: getPostSubmitStepCountLabel(routeEntry.form, getStringAnswers(validation.payload.answers)),
    });

    return redirectNoStore(c, getFormRoutePostSubmitUrl(routeEntry.routeSegments, routeEntry.form), 303);
  });
}

async function parseJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

async function parseFormData(request: Request): Promise<{ ok: true; value: NativeFormData } | { ok: false }> {
  try {
    return { ok: true, value: (await request.formData()) as NativeFormData };
  } catch {
    return { ok: false };
  }
}

function getStepAt(form: InstantForm, index: number): FormStep {
  const stepDefinition = form.steps[index];

  if (!stepDefinition) {
    throw new Error(`Missing step at index ${index}.`);
  }

  return stepDefinition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNativeSubmissionAnswers(formData: NativeFormData): Record<string, JsonPayloadValue> {
  const answers: Record<string, JsonPayloadValue> = {};
  const answerFieldPattern = /^answers\[([^\]]+)\]$/u;
  const nestedAnswerFieldPattern = /^answers\[([^\]]+)\]\[([^\]]+)\]$/u;

  for (const [fieldName, fieldValue] of formData.entries()) {
    if (typeof fieldValue !== "string") {
      continue;
    }

    const nestedMatch = nestedAnswerFieldPattern.exec(fieldName);
    const nestedAnswerKey = nestedMatch?.[1];
    const nestedFieldKey = nestedMatch?.[2];
    if (nestedAnswerKey && nestedFieldKey) {
      const currentAnswer = answers[nestedAnswerKey];
      const answerObject = isRecord(currentAnswer) ? { ...currentAnswer } : {};
      answerObject[nestedFieldKey] = fieldValue.trim();
      answers[nestedAnswerKey] = answerObject;
      continue;
    }

    const match = answerFieldPattern.exec(fieldName);
    const answerKey = match?.[1];
    if (answerKey) {
      answers[answerKey] = fieldValue.trim();
    }
  }

  return answers;
}

function getStringAnswers(answers: Record<string, JsonPayloadValue>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(answers).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
  );
}

function getNativeTrustedFormCertUrl(form: InstantForm, formData: NativeFormData): string | undefined {
  const trustedFormStep = form.steps.find((stepDefinition) => stepDefinition.kind === "trusted_form_consent");
  const fieldName = trustedFormStep?.kind === "trusted_form_consent" ? trustedFormStep.trustedForm.fieldName : undefined;
  const candidateFieldNames = ["trustedFormCertUrl", ...(fieldName ? [fieldName] : [])];

  for (const candidateFieldName of candidateFieldNames) {
    const value = formData.get(candidateFieldName);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function createNativeSubmissionTrackingEvents(
  c: Context,
  form: InstantForm,
  routeKey: string,
  payload: SubmissionPayload,
  browserIds: MetaBrowserIds = {},
) {
  const eventSourceUrl = getRequestPageUrl(c.req.raw.url);
  const lifecycleEvent = createLifecycleTrackingEvent({
    form,
    routeKey,
    kind: "submitSuccess",
    submission: payload,
    browserIds,
    eventSourceUrl: browserIds.eventSourceUrl ?? eventSourceUrl,
  });
  scheduleTrackingServerCallback(c, form, routeKey, lifecycleEvent, {
    answers: payload.answers,
    submission: payload,
  });

  return lifecycleEvent ? [lifecycleEvent.payload] : [];
}

function createCheckpointTrackingEvents(
  c: Context,
  form: InstantForm,
  routeKey: string,
  stepUrl: string,
  step: FormStep,
  stepIndex: number,
  answers: Record<string, string>,
  browserIds: MetaBrowserIds = {},
) {
  const eventSourceUrl = browserIds.eventSourceUrl ?? getRequestAbsoluteUrl(c.req.raw.url, stepUrl);
  const lifecycleEvent = createLifecycleTrackingEvent({
    form,
    routeKey,
    kind: "stepAnswer",
    step,
    stepIndex: stepIndex === -1 ? undefined : stepIndex,
    extra: { answer_key: step.key },
    answers,
    browserIds,
    eventId: crypto.randomUUID(),
    eventSourceUrl,
    requireServerBuilt: true,
  });
  scheduleTrackingServerCallback(c, form, routeKey, lifecycleEvent, {
    answers,
    step,
    stepIndex: stepIndex === -1 ? undefined : stepIndex,
  });

  return lifecycleEvent ? [lifecycleEvent.payload] : [];
}

function createTrustedFormSubstepTrackingEvents(
  c: Context,
  form: InstantForm,
  routeKey: string,
  stepUrl: string,
  step: FormStep,
  stepIndex: number,
  trustedFormSubstep: "review" | "consent",
  answers: Record<string, string>,
  browserIds: MetaBrowserIds = {},
) {
  const eventSourceUrl = browserIds.eventSourceUrl ?? getRequestAbsoluteUrl(c.req.raw.url, stepUrl);
  const lifecycleEvent = createLifecycleTrackingEvent({
    form,
    routeKey,
    kind: "trustedFormSubstepView",
    step,
    stepIndex: stepIndex === -1 ? undefined : stepIndex,
    extra: { trusted_form_substep: trustedFormSubstep },
    answers,
    browserIds,
    eventId: crypto.randomUUID(),
    eventSourceUrl,
    requireServerBuilt: true,
  });
  scheduleTrackingServerCallback(c, form, routeKey, lifecycleEvent, {
    answers,
    step,
    stepIndex: stepIndex === -1 ? undefined : stepIndex,
  });

  return lifecycleEvent ? [lifecycleEvent.payload] : [];
}

function getJsonMetaBrowserIds(input: unknown): MetaBrowserIds {
  if (!isRecord(input) || !isRecord(input.tracking)) {
    return {};
  }

  return readMetaBrowserIds(input.tracking, {});
}

function createNativeSubmissionMetaBrowserIds(c: Context, formData: NativeFormData): MetaBrowserIds {
  return readMetaBrowserIds(getNativeTrackingFields(formData), {
    fbp: getCookie(c, "_fbp"),
    fbc: getCookie(c, "_fbc"),
  });
}

function createSubmissionMappingContext(c: Context, browser: MetaBrowserIds): SubmissionMappingContext {
  const userAgent = c.req.raw.headers.get("user-agent")?.trim() || undefined;
  const ip = getRequestIp(c.req.raw.headers);

  return {
    cookies: {
      get: (name: string) => getCookie(c, name),
    },
    request: {
      url: c.req.raw.url,
      ...(ip ? { ip } : {}),
      ...(userAgent ? { userAgent } : {}),
    },
    browser,
  };
}

function getNativeTrackingFields(formData: NativeFormData): Record<string, string> {
  const values: Record<string, string> = {};
  const trackingFieldPattern = /^tracking\[([^\]]+)\]$/u;

  for (const [fieldName, fieldValue] of formData.entries()) {
    if (typeof fieldValue !== "string") {
      continue;
    }

    const match = trackingFieldPattern.exec(fieldName);
    const key = match?.[1];
    if (key) {
      values[key] = fieldValue.trim();
    }
  }

  return values;
}

function readMetaBrowserIds(input: Record<string, unknown>, fallback: MetaBrowserIds): MetaBrowserIds {
  return {
    ...fallback,
    ...getStringProperty(input, "fbp", "_fbp"),
    ...getStringProperty(input, "fbc", "_fbc"),
    ...getStringProperty(input, "fbclid"),
    ...getStringProperty(input, "eventSourceUrl"),
  };
}

function getStringProperty(input: Record<string, unknown>, ...keys: readonly string[]): MetaBrowserIds {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return { [key.startsWith("_") ? key.slice(1) : key]: value.trim() };
    }
  }

  return {};
}

function getRequestPageUrl(url: string): string {
  const requestUrl = new URL(url);
  requestUrl.pathname = requestUrl.pathname.replace(/\/api\/forms\/[^/]+\/native-submissions$/u, "");
  return requestUrl.toString();
}

function getRequestIp(headers: Headers): string | undefined {
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined
  );
}

function getRequestAbsoluteUrl(requestUrl: string, path: string): string {
  return new URL(path, new URL(requestUrl).origin).toString();
}

function getPostSubmitStepCountLabel(form: InstantForm, answers: Record<string, string>): string {
  const countedStepCount = form.steps.filter(
    (stepDefinition) => isStepVisible(stepDefinition, answers) && isCountedStep(stepDefinition),
  ).length;
  const finalCount = Math.max(countedStepCount, 1);

  return form.ui.progress.stepCount
    .replaceAll("{{current}}", String(finalCount))
    .replaceAll("{{total}}", String(finalCount));
}

function renderNativeSubmissionErrorPage(form: InstantForm, routeKey: string, messages: readonly string[]): string;
function renderNativeSubmissionErrorPage(messages: readonly string[]): string;
function renderNativeSubmissionErrorPage(
  formOrMessages: InstantForm | readonly string[],
  routeKeyOrMessages?: string | readonly string[],
  maybeMessages?: readonly string[],
): string {
  if (isNativeSubmissionErrorForm(formOrMessages)) {
    return renderNativeSubmissionErrorPageContent(
      formOrMessages,
      typeof routeKeyOrMessages === "string" ? routeKeyOrMessages : "native_submission",
      maybeMessages ?? (Array.isArray(routeKeyOrMessages) ? routeKeyOrMessages : []),
    );
  }

  return renderNativeSubmissionErrorPageContent(undefined, undefined, formOrMessages);
}

function renderNativeSubmissionErrorPageContent(
  form: InstantForm | undefined,
  routeKey: string | undefined,
  messages: readonly string[],
): string {
  const locale = form?.locale ?? "en";
  const pageCopy = form?.ui.pages.nativeSubmissionError;
  const fallbackMessage = pageCopy?.fallbackMessage ?? "Unable to submit the form.";
  const message = messages[0] ?? fallbackMessage;
  const title = pageCopy?.title ?? "Unable to submit the form";
  const heading = pageCopy?.heading ?? title;
  const googleTagManager = form ? getNativePageGoogleTagManager(form, routeKey ?? "native_submission") : undefined;
  const trackingHead = renderGoogleTagManagerHead(
    googleTagManager,
    form
      ? [
          createLifecycleTrackingPayload({
            form,
            routeKey: routeKey ?? "native_submission",
            kind: "submitError",
            extra: { error_message: message },
          }),
        ].filter((eventPayload): eventPayload is NonNullable<typeof eventPayload> => Boolean(eventPayload))
      : [],
  );

  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
${trackingHead}
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #fffdf4;
        color: #111427;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 24px;
      }
      main {
        width: min(100%, 720px);
        border: 1px solid #d9dff0;
        border-radius: 8px;
        background: #fffdf4;
        padding: clamp(28px, 6vw, 64px);
      }
      h1 {
        margin: 0 0 16px;
        color: #073b8e;
        font-size: clamp(2rem, 7vw, 3.5rem);
        line-height: 1;
      }
      p {
        margin: 0;
        color: #4d5878;
        font-size: 1.1rem;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

function isNativeSubmissionErrorForm(value: InstantForm | readonly string[]): value is InstantForm {
  return !Array.isArray(value);
}

function getNativePageGoogleTagManager(form: InstantForm, routeKey: string) {
  return createClientFormConfig(form, 0, {}, false, () => "", { routeKey }).tracking?.googleTagManager;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
