import type { Hono } from "hono";

import {
  canAccessStep,
  getNextStepIndex,
  getResumeStepIndex,
  sanitizeCheckpointAnswers,
  validateCheckpointAnswer,
} from "../../persistence/checkpoints";
import {
  getFormByAreaCode,
  getStepByKey,
  getStepUrl,
  isStepVisible,
  type FormStep,
  type InstantForm,
} from "../../flow";
import { validateSubmission, type SubmissionPayload } from "../../submissions/validation";
import { clearCheckpointAnswers, readCheckpointAnswers, setCheckpointAnswers } from "../http/cookies";
import { jsonResponse } from "../http/responses";

export type SubmissionLogger = (payload: SubmissionPayload) => void;

export function registerFormRoutes(app: Hono, logger: SubmissionLogger): void {
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
}

async function parseJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
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
