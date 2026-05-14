import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
  decodeCheckpointAnswers,
  encodeCheckpointAnswers,
  getCheckpointCookieName,
  getNextStepIndex,
  getResumeStepIndex,
  canAccessStep,
  sanitizeCheckpointAnswers,
  validateCheckpointAnswer,
  type CheckpointAnswers,
} from "./checkpoints";
import {
  getFormByAreaCode,
  getStepByKey,
  getStepIndexByLegacySlug,
  getStepIndexBySlug,
  getStepUrl,
  isStepVisible,
  type FormStep,
  type InstantForm,
} from "./forms";
import { renderFormPage, renderUnavailablePage } from "./render";
import { validateSubmission, type SubmissionPayload } from "./validation";

const logoAssetUrl = new URL("./assets/logo.webp", import.meta.url);

export type SubmissionLogger = (payload: SubmissionPayload) => void;

export type AppOptions = {
  logger?: SubmissionLogger;
};

export function createFetchHandler(options: AppOptions = {}) {
  const app = createApp(options);

  return (request: Request): Promise<Response> | Response => app.fetch(request);
}

export function createApp(options: AppOptions = {}) {
  const logger = options.logger ?? (() => undefined);
  const app = new Hono();

  app.get("/", (c) => redirectNoStore(c, "/tn"));

  app.get("/assets/logo.webp", () => assetResponse(Bun.file(logoAssetUrl), "image/webp"));

  app.get("/__preview/:areaCode/buscando-oferta", (c) => {
    const areaCode = c.req.param("areaCode");
    const form = getFormByAreaCode(areaCode);

    if (!form) {
      return htmlResponse(renderUnavailablePage(areaCode), 404);
    }

    const previewForm = getMatchingPreviewForm(form);

    if (!previewForm) {
      return htmlResponse(renderUnavailablePage(areaCode), 404);
    }

    const previewPath = `/__preview/${form.areaCode}/buscando-oferta`;

    return htmlResponse(
      renderFormPage(previewForm, {
        activeStepIndex: 0,
        answers: {},
        previewMode: true,
        stepUrlOverrides: {
          matching_offer: previewPath,
        },
      }),
      200,
      "no-store",
    );
  });

  app.post("/api/forms/:areaCode/checkpoints", async (c) => {
    const areaCode = c.req.param("areaCode");
    const form = getFormByAreaCode(areaCode);

    if (!form) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "areaCode", message: "Area form is not available." }] },
        404,
      );
    }

    const body = await parseJsonBody(c.req.raw);

    if (!body.ok || !isRecord(body.value)) {
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] }, 400);
    }

    const questionKey = typeof body.value.questionKey === "string" ? body.value.questionKey : "";
    const stepDefinition = getStepByKey(form, questionKey);

    if (!stepDefinition) {
      return jsonResponse(c, { ok: false, errors: [{ field: "questionKey", message: "Question is not available." }] }, 404);
    }

    const answers = readCheckpointAnswers(c, form);
    const stepIndex = form.steps.findIndex((candidate) => candidate.key === stepDefinition.key);

    if (stepDefinition.kind === "interstitial" && (stepIndex === -1 || !canAccessStep(form, stepIndex, answers))) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: "Question is not available yet." }] }, 400);
    }

    const requestedAnswer = typeof body.value.answer === "string" ? body.value.answer.trim() : "";

    if (
      stepDefinition.kind === "interstitial" &&
      requestedAnswer === stepDefinition.seenAnswer &&
      answers[stepDefinition.key] !== stepDefinition.completionAnswer &&
      answers[stepDefinition.key] !== stepDefinition.seenAnswer
    ) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: "Question is not complete yet." }] }, 400);
    }

    if (!isStepVisible(stepDefinition, answers)) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: "Question is not available yet." }] }, 400);
    }

    const validation = validateCheckpointAnswer(stepDefinition, body.value.answer);

    if (!validation.ok) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: validation.message }] }, 400);
    }

    answers[stepDefinition.key] = validation.answer;
    const sanitizedAnswers = sanitizeCheckpointAnswers(form, answers);
    setCheckpointAnswers(c, form, sanitizedAnswers);

    const nextIndex =
      stepDefinition.kind === "interstitial" && validation.answer === stepDefinition.completionAnswer
        ? stepIndex
        : stepIndex === -1
          ? getResumeStepIndex(form, sanitizedAnswers)
          : getNextStepIndex(form, stepIndex, sanitizedAnswers);
    const nextStep = getStepAt(form, nextIndex);

    return jsonResponse(
      c,
      {
        ok: true,
        nextUrl: getStepUrl(form, nextStep),
        answers: sanitizedAnswers,
      },
      200,
    );
  });

  app.post("/api/forms/:areaCode/submissions", async (c) => {
    const areaCode = c.req.param("areaCode");
    const form = getFormByAreaCode(areaCode);

    if (!form) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "areaCode", message: "Area form is not available." }] },
        404,
      );
    }

    const body = await parseJsonBody(c.req.raw);

    if (!body.ok) {
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] }, 400);
    }

    const validation = validateSubmission(form, body.value);

    if (validation.ok === false) {
      return jsonResponse(c, { ok: false, errors: validation.errors }, 400);
    }

    logger(validation.payload);
    clearCheckpointAnswers(c, form);

    return jsonResponse(c, { ok: true, submittedAt: validation.payload.submittedAt }, 201);
  });

  app.get("/:areaCode", (c) => {
    const areaCode = c.req.param("areaCode");
    const form = getFormByAreaCode(areaCode);

    if (!form) {
      return htmlResponse(renderUnavailablePage(areaCode), 404);
    }

    const answers = readCheckpointAnswers(c, form);
    const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

    return redirectNoStore(c, getStepUrl(form, resumeStep));
  });

  app.get("/:areaCode/:stepSlug", (c) => {
    const areaCode = c.req.param("areaCode");
    const stepSlug = c.req.param("stepSlug");
    const form = getFormByAreaCode(areaCode);

    if (!form) {
      return htmlResponse(renderUnavailablePage(areaCode), 404);
    }

    const stepIndex = getStepIndexBySlug(form, stepSlug);

    if (stepIndex === -1) {
      const legacyStepIndex = getStepIndexByLegacySlug(form, stepSlug);

      if (legacyStepIndex !== -1) {
        const answers = readCheckpointAnswers(c, form);

        if (!canAccessStep(form, legacyStepIndex, answers)) {
          const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

          return redirectNoStore(c, getStepUrl(form, resumeStep));
        }

        const legacyStep = getStepAt(form, legacyStepIndex);

        return redirectNoStore(c, getStepUrl(form, legacyStep));
      }

      return redirectNoStore(c, `/${form.areaCode}`);
    }

    const answers = readCheckpointAnswers(c, form);

    if (!canAccessStep(form, stepIndex, answers)) {
      const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

      return redirectNoStore(c, getStepUrl(form, resumeStep));
    }

    const requestedStep = getStepAt(form, stepIndex);

    if (requestedStep.kind === "interstitial" && answers[requestedStep.key] === requestedStep.seenAnswer) {
      const nextStep = getStepAt(form, getNextStepIndex(form, stepIndex, answers));

      return redirectNoStore(c, getStepUrl(form, nextStep));
    }

    return htmlResponse(
      renderFormPage(form, {
        activeStepIndex: stepIndex,
        answers,
      }),
      200,
      "no-store",
    );
  });

  app.get("/:areaCode/*", (c) => {
    const areaCode = c.req.param("areaCode");
    const form = getFormByAreaCode(areaCode);

    if (!form) {
      return htmlResponse(renderUnavailablePage(areaCode), 404);
    }

    return redirectNoStore(c, `/${form.areaCode}`);
  });

  app.notFound(() => htmlResponse(renderUnavailablePage("esta ruta"), 404));

  return app;
}

async function parseJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

function readCheckpointAnswers(c: Context, form: InstantForm): CheckpointAnswers {
  const cookieValue = getCookie(c, getCheckpointCookieName(form.areaCode));
  const decodedAnswers = decodeCheckpointAnswers(cookieValue);

  return sanitizeCheckpointAnswers(form, decodedAnswers);
}

function setCheckpointAnswers(c: Context, form: InstantForm, answers: CheckpointAnswers): void {
  setCookie(c, getCheckpointCookieName(form.areaCode), encodeCheckpointAnswers(answers), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(c.req.raw),
  });
}

function clearCheckpointAnswers(c: Context, form: InstantForm): void {
  deleteCookie(c, getCheckpointCookieName(form.areaCode), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

function getStepAt(form: InstantForm, index: number): FormStep {
  const stepDefinition = form.steps[index];

  if (!stepDefinition) {
    throw new Error(`Missing step at index ${index}.`);
  }

  return stepDefinition;
}

function getMatchingPreviewForm(form: InstantForm): InstantForm | undefined {
  const matchingStep = form.steps.find((stepDefinition) => stepDefinition.kind === "interstitial" && stepDefinition.key === "matching_offer");

  if (!matchingStep) {
    return undefined;
  }

  return {
    ...form,
    steps: [matchingStep],
  };
}

function htmlResponse(body: string, status = 200, cacheControl = "public, max-age=300"): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

function redirectNoStore(c: Context, url: string): Response {
  c.header("Cache-Control", "no-store");

  return c.redirect(url, 302);
}

function jsonResponse(c: Context, body: unknown, status: ContentfulStatusCode): Response {
  c.header("Cache-Control", "no-store");

  return c.json(body, status);
}

function assetResponse(body: Blob, contentType: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
