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
  getFormByStateCode,
  getQuestionByKey,
  getQuestionIndexByLegacySlug,
  getQuestionIndexBySlug,
  getStepUrl,
  isQuestionVisible,
  type FormQuestion,
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

  app.get("/", (c) => c.redirect("/tn", 302));

  app.get("/assets/logo.webp", () => assetResponse(Bun.file(logoAssetUrl), "image/webp"));

  app.post("/api/forms/:stateCode/checkpoints", async (c) => {
    const stateCode = c.req.param("stateCode");
    const form = getFormByStateCode(stateCode);

    if (!form) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "stateCode", message: "State form is not available." }] },
        404,
      );
    }

    const body = await parseJsonBody(c.req.raw);

    if (!body.ok || !isRecord(body.value)) {
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] }, 400);
    }

    const questionKey = typeof body.value.questionKey === "string" ? body.value.questionKey : "";
    const question = getQuestionByKey(form, questionKey);

    if (!question) {
      return jsonResponse(c, { ok: false, errors: [{ field: "questionKey", message: "Question is not available." }] }, 404);
    }

    const answers = readCheckpointAnswers(c, form);
    const questionIndex = form.questions.findIndex((candidate) => candidate.key === question.key);

    if (question.kind === "interstitial" && (questionIndex === -1 || !canAccessStep(form, questionIndex, answers))) {
      return jsonResponse(c, { ok: false, errors: [{ field: question.key, message: "Question is not available yet." }] }, 400);
    }

    const requestedAnswer = typeof body.value.answer === "string" ? body.value.answer.trim() : "";

    if (
      question.kind === "interstitial" &&
      requestedAnswer === question.seenAnswer &&
      answers[question.key] !== question.completionAnswer &&
      answers[question.key] !== question.seenAnswer
    ) {
      return jsonResponse(c, { ok: false, errors: [{ field: question.key, message: "Question is not complete yet." }] }, 400);
    }

    if (!isQuestionVisible(question, answers)) {
      return jsonResponse(c, { ok: false, errors: [{ field: question.key, message: "Question is not available yet." }] }, 400);
    }

    const validation = validateCheckpointAnswer(question, body.value.answer);

    if (!validation.ok) {
      return jsonResponse(c, { ok: false, errors: [{ field: question.key, message: validation.message }] }, 400);
    }

    answers[question.key] = validation.answer;
    const sanitizedAnswers = sanitizeCheckpointAnswers(form, answers);
    setCheckpointAnswers(c, form, sanitizedAnswers);

    const nextIndex =
      question.kind === "interstitial" && validation.answer === question.completionAnswer
        ? questionIndex
        : questionIndex === -1
          ? getResumeStepIndex(form, sanitizedAnswers)
          : getNextStepIndex(form, questionIndex, sanitizedAnswers);
    const nextQuestion = getQuestionAt(form, nextIndex);

    return jsonResponse(
      c,
      {
        ok: true,
        nextUrl: getStepUrl(form, nextQuestion),
        answers: sanitizedAnswers,
      },
      200,
    );
  });

  app.post("/api/forms/:stateCode/submissions", async (c) => {
    const stateCode = c.req.param("stateCode");
    const form = getFormByStateCode(stateCode);

    if (!form) {
      return jsonResponse(
        c,
        { ok: false, errors: [{ field: "stateCode", message: "State form is not available." }] },
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

  app.get("/:stateCode", (c) => {
    const stateCode = c.req.param("stateCode");
    const form = getFormByStateCode(stateCode);

    if (!form) {
      return htmlResponse(renderUnavailablePage(stateCode), 404);
    }

    const answers = readCheckpointAnswers(c, form);
    const resumeStep = getQuestionAt(form, getResumeStepIndex(form, answers));

    return c.redirect(getStepUrl(form, resumeStep), 302);
  });

  app.get("/:stateCode/:stepSlug", (c) => {
    const stateCode = c.req.param("stateCode");
    const stepSlug = c.req.param("stepSlug");
    const form = getFormByStateCode(stateCode);

    if (!form) {
      return htmlResponse(renderUnavailablePage(stateCode), 404);
    }

    const stepIndex = getQuestionIndexBySlug(form, stepSlug);

    if (stepIndex === -1) {
      const legacyStepIndex = getQuestionIndexByLegacySlug(form, stepSlug);

      if (legacyStepIndex !== -1) {
        const answers = readCheckpointAnswers(c, form);

        if (!canAccessStep(form, legacyStepIndex, answers)) {
          const resumeStep = getQuestionAt(form, getResumeStepIndex(form, answers));

          return c.redirect(getStepUrl(form, resumeStep), 302);
        }

        const legacyStep = getQuestionAt(form, legacyStepIndex);

        return c.redirect(getStepUrl(form, legacyStep), 302);
      }

      return c.redirect(`/${form.stateCode}`, 302);
    }

    const answers = readCheckpointAnswers(c, form);

    if (!canAccessStep(form, stepIndex, answers)) {
      const resumeStep = getQuestionAt(form, getResumeStepIndex(form, answers));

      return c.redirect(getStepUrl(form, resumeStep), 302);
    }

    const requestedStep = getQuestionAt(form, stepIndex);

    if (requestedStep.kind === "interstitial" && answers[requestedStep.key] === requestedStep.seenAnswer) {
      const nextStep = getQuestionAt(form, getNextStepIndex(form, stepIndex, answers));

      return c.redirect(getStepUrl(form, nextStep), 302);
    }

    return htmlResponse(
      renderFormPage(form, {
        activeStepIndex: stepIndex,
        answers,
      }),
    );
  });

  app.get("/:stateCode/*", (c) => {
    const stateCode = c.req.param("stateCode");
    const form = getFormByStateCode(stateCode);

    if (!form) {
      return htmlResponse(renderUnavailablePage(stateCode), 404);
    }

    return c.redirect(`/${form.stateCode}`, 302);
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
  const cookieValue = getCookie(c, getCheckpointCookieName(form.stateCode));
  const decodedAnswers = decodeCheckpointAnswers(cookieValue);

  return sanitizeCheckpointAnswers(form, decodedAnswers);
}

function setCheckpointAnswers(c: Context, form: InstantForm, answers: CheckpointAnswers): void {
  setCookie(c, getCheckpointCookieName(form.stateCode), encodeCheckpointAnswers(answers), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(c.req.raw),
  });
}

function clearCheckpointAnswers(c: Context, form: InstantForm): void {
  deleteCookie(c, getCheckpointCookieName(form.stateCode), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

function getQuestionAt(form: InstantForm, index: number): FormQuestion {
  const question = form.questions[index];

  if (!question) {
    throw new Error(`Missing question at index ${index}.`);
  }

  return question;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
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
