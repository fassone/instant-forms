import type { Hono } from "hono";

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
import { createResolvedStepPayload } from "../../rendering";
import { clearCheckpointAnswers, readCheckpointAnswers, setCheckpointAnswers } from "../http/cookies";
import { jsonResponse } from "../http/responses";

export type SubmissionLogger = (payload: SubmissionPayload) => void;

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
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] }, 400);
    }

    const questionKey = typeof body.value.questionKey === "string" ? body.value.questionKey : "";
    const stepDefinition = getStepByKey(form, questionKey);

    if (!stepDefinition) {
      return jsonResponse(c, { ok: false, errors: [{ field: "questionKey", message: "Question is not available." }] }, 404);
    }

    const answers = readCheckpointAnswers(c, form, routeEntry.routeKey);
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
    setCheckpointAnswers(c, routeEntry.routeKey, sanitizedAnswers);

    const nextIndex =
      stepDefinition.kind === "interstitial" && validation.answer === stepDefinition.completionAnswer
        ? stepIndex
        : stepIndex === -1
          ? getResumeStepIndex(form, sanitizedAnswers)
          : getNextStepIndex(form, stepIndex, sanitizedAnswers);
    const nextStep = getStepAt(form, nextIndex);
    const nextStepPayload =
      hasStepDynamicResolvers(nextStep) && canResolveStepDynamicValues(nextStep, sanitizedAnswers)
        ? createResolvedStepPayload(form, nextIndex, sanitizedAnswers, (step) =>
            getFormRouteStepUrl(routeEntry.routeSegments, step),
          )
        : undefined;

    return jsonResponse(
      c,
      {
        ok: true,
        nextUrl: getFormRouteStepUrl(routeEntry.routeSegments, nextStep),
        answers: sanitizedAnswers,
        ...(nextStepPayload ? { nextStep: nextStepPayload } : {}),
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
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] }, 400);
    }

    const stepKey = typeof body.value.stepKey === "string" ? body.value.stepKey : "";
    const stepDefinition = getStepByKey(routeEntry.form, stepKey);

    if (!stepDefinition) {
      return jsonResponse(c, { ok: false, errors: [{ field: "stepKey", message: "Question is not available." }] }, 404);
    }

    const answerSnapshot = isRecord(body.value.answers) ? body.value.answers : {};
    const sanitizedAnswers = sanitizeCheckpointAnswers(routeEntry.form, answerSnapshot);
    const stepIndex = routeEntry.form.steps.findIndex((candidate) => candidate.key === stepDefinition.key);

    if (stepIndex === -1 || !canAccessStep(routeEntry.form, stepIndex, sanitizedAnswers)) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: "Question is not available yet." }] }, 400);
    }

    if (hasStepDynamicResolvers(stepDefinition) && !canResolveStepDynamicValues(stepDefinition, sanitizedAnswers)) {
      return jsonResponse(c, { ok: false, errors: [{ field: stepDefinition.key, message: "Question is not ready yet." }] }, 400);
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
              message: error instanceof Error ? error.message : "No pudimos preparar este paso.",
            },
          ],
        },
        400,
      );
    }
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
      return jsonResponse(c, { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] }, 400);
    }

    const validation = validateSubmission(routeEntry.form, routeEntry.routeKey, body.value);

    if (validation.ok === false) {
      return jsonResponse(c, { ok: false, errors: validation.errors }, 400);
    }

    logger(validation.payload);
    clearCheckpointAnswers(c, routeEntry.routeKey);

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
