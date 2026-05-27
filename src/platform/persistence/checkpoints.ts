import { getVisibleSteps, isStepVisible, type FormStep, type InstantForm } from "../flow";
import { isStepAnswered, validateStepCheckpointAnswer } from "../steps/adapters";

export type CheckpointAnswers = Record<string, string>;

export type CheckpointValidationResult =
  | {
      ok: true;
      answer: string;
    }
  | {
      ok: false;
      message: string;
    };

export const CHECKPOINT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function getCheckpointCookieName(routeKey: string): string {
  return `instant_forms_${routeKey.toLowerCase()}_answers`;
}

export function encodeCheckpointAnswers(answers: CheckpointAnswers): string {
  const json = JSON.stringify(answers);

  return Buffer.from(json, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function decodeCheckpointAnswers(value: string | undefined): unknown {
  if (!value) {
    return {};
  }

  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = Buffer.from(paddedBase64, "base64").toString("utf8");

    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function sanitizeCheckpointAnswers(form: InstantForm, input: unknown): CheckpointAnswers {
  if (!isRecord(input)) {
    return {};
  }

  const answers: CheckpointAnswers = {};

  for (const stepDefinition of form.steps) {
    if (!isStepVisible(stepDefinition, answers)) {
      continue;
    }

    const rawAnswer = input[stepDefinition.key];
    const validation = validateCheckpointAnswer(form, stepDefinition, rawAnswer);

    if (validation.ok) {
      answers[stepDefinition.key] = validation.answer;
    }
  }

  return answers;
}

export function validateCheckpointAnswer(
  form: InstantForm,
  stepDefinition: FormStep,
  input: unknown,
): CheckpointValidationResult {
  const validation = validateStepCheckpointAnswer(stepDefinition, input, form.ui.errors);

  if (!validation.ok) {
    return validation;
  }

  if (typeof validation.answer !== "string") {
    return { ok: false, message: form.ui.errors.incompleteStep };
  }

  return { ok: true, answer: validation.answer };
}

export function getFirstUnansweredStepIndex(form: InstantForm, answers: CheckpointAnswers): number | undefined {
  const firstUnansweredStep = getVisibleSteps(form, answers).find((stepDefinition) => !isStepAnswered(stepDefinition, answers));

  if (!firstUnansweredStep) {
    return undefined;
  }

  const firstUnansweredIndex = form.steps.findIndex((stepDefinition) => stepDefinition.key === firstUnansweredStep.key);

  return firstUnansweredIndex === -1 ? undefined : firstUnansweredIndex;
}

export function getResumeStepIndex(form: InstantForm, answers: CheckpointAnswers): number {
  const firstUnansweredIndex = getFirstUnansweredStepIndex(form, answers);

  if (firstUnansweredIndex !== undefined) {
    return firstUnansweredIndex;
  }

  const visibleSteps = getVisibleSteps(form, answers);
  const lastVisibleStep = visibleSteps[visibleSteps.length - 1];

  if (!lastVisibleStep) {
    return 0;
  }

  const lastVisibleIndex = form.steps.findIndex((stepDefinition) => stepDefinition.key === lastVisibleStep.key);

  return lastVisibleIndex === -1 ? 0 : lastVisibleIndex;
}

export function canAccessStep(form: InstantForm, stepIndex: number, answers: CheckpointAnswers): boolean {
  const requestedStep = form.steps[stepIndex];

  if (!requestedStep || !isStepVisible(requestedStep, answers)) {
    return false;
  }

  const visibleSteps = getVisibleSteps(form, answers);
  const requestedVisibleIndex = visibleSteps.findIndex((stepDefinition) => stepDefinition.key === requestedStep.key);
  const firstUnansweredIndex = getFirstUnansweredStepIndex(form, answers);

  if (requestedVisibleIndex === -1) {
    return false;
  }

  if (firstUnansweredIndex === undefined) {
    return true;
  }

  const firstUnansweredStep = form.steps[firstUnansweredIndex];
  const firstUnansweredVisibleIndex = firstUnansweredStep
    ? visibleSteps.findIndex((stepDefinition) => stepDefinition.key === firstUnansweredStep.key)
    : -1;

  return firstUnansweredVisibleIndex !== -1 && requestedVisibleIndex <= firstUnansweredVisibleIndex;
}

export function getNextStepIndex(form: InstantForm, currentStepIndex: number, answers: CheckpointAnswers): number {
  const visibleSteps = getVisibleSteps(form, answers);
  const nextVisibleStep = visibleSteps.find((stepDefinition) => {
    const stepIndex = form.steps.findIndex((candidate) => candidate.key === stepDefinition.key);

    return stepIndex > currentStepIndex;
  });

  if (!nextVisibleStep) {
    const resumeStepIndex = getResumeStepIndex(form, answers);

    return resumeStepIndex;
  }

  const nextStepIndex = form.steps.findIndex((stepDefinition) => stepDefinition.key === nextVisibleStep.key);

  return nextStepIndex === -1 ? getResumeStepIndex(form, answers) : nextStepIndex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
