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
  isStepVisible,
  type FormStep,
  type InstantForm,
} from "../../flow";
import {
  getFormRouteByRouteKey,
  getFormRouteStepUrl,
  type FormRoutes,
} from "../../routing";
import { validateSubmission, type SubmissionPayload } from "../../submissions/validation";
import {
  createLifecycleTrackingPayload,
  createResolvedStepPayload,
  renderGoogleTagManagerHead,
  type MetaBrowserIds,
} from "../../rendering";
import { createClientFormConfig } from "../../rendering/client/config";
import { clearCheckpointAnswers, readCheckpointAnswers, setCheckpointAnswers } from "../http/cookies";
import { htmlResponse, jsonResponse } from "../http/responses";

export type SubmissionLogger = (payload: SubmissionPayload) => void;

type NativeFormData = {
  entries(): IterableIterator<[string, unknown]>;
  get(name: string): unknown;
};

export function registerFormRoutes(app: Hono, routes: FormRoutes, logger: SubmissionLogger): void {
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
      form,
      routeEntry.routeKey,
      c.req.raw,
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
      routeEntry.form,
      routeEntry.routeKey,
      c.req.raw,
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

    const validation = validateSubmission(routeEntry.form, routeEntry.routeKey, body.value);

    if (validation.ok === false) {
      return jsonResponse(c, { ok: false, errors: validation.errors }, 400);
    }

    logger(validation.payload);
    clearCheckpointAnswers(c, routeEntry.routeKey);

    const trackingEvents = createNativeSubmissionTrackingEvents(
      routeEntry.form,
      routeEntry.routeKey,
      c.req.raw,
      validation.payload,
      getJsonMetaBrowserIds(body.value),
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
    const validation = validateSubmission(routeEntry.form, routeEntry.routeKey, {
      answers: {
        ...checkpointAnswers,
        ...postedAnswers,
      },
      trustedFormCertUrl,
    });

    if (validation.ok === false) {
      return htmlResponse(
        renderNativeSubmissionErrorPage(routeEntry.form, routeEntry.routeKey, validation.errors.map((error) => error.message)),
        400,
        "no-store",
      );
    }

    logger(validation.payload);
    clearCheckpointAnswers(c, routeEntry.routeKey);

    const response = htmlResponse(
      renderNativeSubmissionThanksPage(
        routeEntry.form,
        routeEntry.routeKey,
        validation.payload,
        createNativeSubmissionMetaBrowserIds(c, formDataResult.value),
        c.req.raw.url,
      ),
      200,
      "no-store",
    );
    const setCookie = c.res.headers.get("Set-Cookie");
    if (setCookie) {
      response.headers.set("Set-Cookie", setCookie);
    }

    return response;
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

function getNativeSubmissionAnswers(formData: NativeFormData): Record<string, string> {
  const answers: Record<string, string> = {};
  const answerFieldPattern = /^answers\[([^\]]+)\]$/u;

  for (const [fieldName, fieldValue] of formData.entries()) {
    if (typeof fieldValue !== "string") {
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
  form: InstantForm,
  routeKey: string,
  request: Pick<Request, "url">,
  payload: SubmissionPayload,
  browserIds: MetaBrowserIds = {},
) {
  const eventSourceUrl = getRequestPageUrl(request.url);
  const eventPayload = createLifecycleTrackingPayload({
    form,
    routeKey,
    kind: "submitSuccess",
    submission: payload,
    browserIds,
    eventSourceUrl: browserIds.eventSourceUrl ?? eventSourceUrl,
  });

  return eventPayload ? [eventPayload] : [];
}

function createCheckpointTrackingEvents(
  form: InstantForm,
  routeKey: string,
  request: Pick<Request, "url">,
  stepUrl: string,
  step: FormStep,
  stepIndex: number,
  answers: Record<string, string>,
  browserIds: MetaBrowserIds = {},
) {
  const eventSourceUrl = browserIds.eventSourceUrl ?? getRequestAbsoluteUrl(request.url, stepUrl);
  const eventPayload = createLifecycleTrackingPayload({
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
    requireMeta: true,
  });

  return eventPayload ? [eventPayload] : [];
}

function createTrustedFormSubstepTrackingEvents(
  form: InstantForm,
  routeKey: string,
  request: Pick<Request, "url">,
  stepUrl: string,
  step: FormStep,
  stepIndex: number,
  trustedFormSubstep: "review" | "consent",
  answers: Record<string, string>,
  browserIds: MetaBrowserIds = {},
) {
  const eventSourceUrl = browserIds.eventSourceUrl ?? getRequestAbsoluteUrl(request.url, stepUrl);
  const eventPayload = createLifecycleTrackingPayload({
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
    requireMeta: true,
  });

  return eventPayload ? [eventPayload] : [];
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

function getRequestAbsoluteUrl(requestUrl: string, path: string): string {
  return new URL(path, new URL(requestUrl).origin).toString();
}

function renderNativeSubmissionThanksPage(
  form: InstantForm,
  routeKey: string,
  payload: SubmissionPayload,
  browserIds: MetaBrowserIds,
  eventSourceUrl: string,
): string {
  const googleTagManager = getNativePageGoogleTagManager(form, routeKey);
  const trackingHead = renderGoogleTagManagerHead(
    googleTagManager,
    createNativeSubmissionTrackingEvents(form, routeKey, { url: eventSourceUrl }, payload, browserIds),
  );

  return `<!doctype html>
<html lang="${escapeHtml(form.locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(form.ui.pages.thankYou.title)}</title>
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
        font-size: clamp(2.2rem, 8vw, 4.5rem);
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
      <h1>${escapeHtml(form.ui.pages.thankYou.title)}</h1>
      <p>${escapeHtml(form.ui.pages.thankYou.message)}</p>
    </main>
  </body>
</html>`;
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
