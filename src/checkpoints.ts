import { getVisibleQuestions, isQuestionVisible } from "./forms";
import type { FormQuestion, InstantForm } from "./forms";
import { US_STATE_VALIDATION_MESSAGE, normalizeUsState } from "./us-states";
import { US_PHONE_VALIDATION_MESSAGE, normalizeUsPhoneNumber } from "./validation";

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

export function getCheckpointCookieName(stateCode: string): string {
  return `instant_forms_${stateCode.toLowerCase()}_answers`;
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

  for (const question of form.questions) {
    if (!isQuestionVisible(question, answers)) {
      continue;
    }

    const rawAnswer = input[question.key];
    const validation = validateCheckpointAnswer(question, rawAnswer);

    if (validation.ok) {
      answers[question.key] = validation.answer;
    }
  }

  return answers;
}

export function validateCheckpointAnswer(question: FormQuestion, input: unknown): CheckpointValidationResult {
  const answer = typeof input === "string" ? input.trim() : "";

  if (!answer) {
    return { ok: false, message: "Esta respuesta es requerida." };
  }

  if (question.kind === "choice") {
    const allowedOption = question.options.some((option) => option.key === answer);

    if (!allowedOption) {
      return { ok: false, message: "Answer is not a valid option." };
    }

    return { ok: true, answer };
  }

  if (question.kind === "state") {
    const normalizedState = normalizeUsState(answer);

    if (!normalizedState) {
      return { ok: false, message: US_STATE_VALIDATION_MESSAGE };
    }

    return { ok: true, answer: normalizedState };
  }

  if (question.type === "PHONE") {
    const normalizedPhone = normalizeUsPhoneNumber(answer);

    if (!normalizedPhone) {
      return { ok: false, message: US_PHONE_VALIDATION_MESSAGE };
    }

    return { ok: true, answer };
  }

  return { ok: true, answer };
}

export function getFirstUnansweredStepIndex(form: InstantForm, answers: CheckpointAnswers): number | undefined {
  const firstUnansweredQuestion = getVisibleQuestions(form, answers).find((question) => !answers[question.key]);

  if (!firstUnansweredQuestion) {
    return undefined;
  }

  const firstUnansweredIndex = form.questions.findIndex((question) => question.key === firstUnansweredQuestion.key);

  return firstUnansweredIndex === -1 ? undefined : firstUnansweredIndex;
}

export function getResumeStepIndex(form: InstantForm, answers: CheckpointAnswers): number {
  const firstUnansweredIndex = getFirstUnansweredStepIndex(form, answers);

  if (firstUnansweredIndex !== undefined) {
    return firstUnansweredIndex;
  }

  const visibleQuestions = getVisibleQuestions(form, answers);
  const lastVisibleQuestion = visibleQuestions[visibleQuestions.length - 1];

  if (!lastVisibleQuestion) {
    return 0;
  }

  const lastVisibleIndex = form.questions.findIndex((question) => question.key === lastVisibleQuestion.key);

  return lastVisibleIndex === -1 ? 0 : lastVisibleIndex;
}

export function canAccessStep(form: InstantForm, stepIndex: number, answers: CheckpointAnswers): boolean {
  const stepQuestion = form.questions[stepIndex];

  if (!stepQuestion || !isQuestionVisible(stepQuestion, answers)) {
    return false;
  }

  const visibleQuestions = getVisibleQuestions(form, answers);
  const requestedVisibleIndex = visibleQuestions.findIndex((question) => question.key === stepQuestion.key);
  const firstUnansweredIndex = getFirstUnansweredStepIndex(form, answers);

  if (requestedVisibleIndex === -1) {
    return false;
  }

  if (firstUnansweredIndex === undefined) {
    return true;
  }

  const firstUnansweredQuestion = form.questions[firstUnansweredIndex];
  const firstUnansweredVisibleIndex = firstUnansweredQuestion
    ? visibleQuestions.findIndex((question) => question.key === firstUnansweredQuestion.key)
    : -1;

  return firstUnansweredVisibleIndex !== -1 && requestedVisibleIndex <= firstUnansweredVisibleIndex;
}

export function getNextStepIndex(form: InstantForm, currentStepIndex: number, answers: CheckpointAnswers): number {
  const currentQuestion = form.questions[currentStepIndex];
  const visibleQuestions = getVisibleQuestions(form, answers);
  const visibleQuestionIndex = currentQuestion
    ? visibleQuestions.findIndex((question) => question.key === currentQuestion.key)
    : -1;
  const nextVisibleQuestion = visibleQuestions[visibleQuestionIndex + 1];

  if (!nextVisibleQuestion) {
    const resumeStepIndex = getResumeStepIndex(form, answers);

    return resumeStepIndex;
  }

  const nextStepIndex = form.questions.findIndex((question) => question.key === nextVisibleQuestion.key);

  return nextStepIndex === -1 ? getResumeStepIndex(form, answers) : nextStepIndex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
