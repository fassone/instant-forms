import type { ChoiceQuestion, FormQuestion, InstantForm } from "./forms";

export type AnswerMap = Record<string, string>;

export type SubmissionPayload = {
  stateCode: string;
  formId: string;
  formName: string;
  pageId: string;
  pageName: string;
  submittedAt: string;
  answers: AnswerMap;
};

export type SubmissionValidationError = {
  field: string;
  message: string;
};

export type SubmissionValidationResult =
  | {
      ok: true;
      payload: SubmissionPayload;
    }
  | {
      ok: false;
      errors: SubmissionValidationError[];
    };

export const US_PHONE_VALIDATION_MESSAGE = "Ingrese un número de teléfono válido de Estados Unidos.";

export function normalizeUsPhoneNumber(value: string): string | undefined {
  const trimmedValue = value.trim();
  const digitsOnly = value.replace(/\D/g, "");
  const startsWithPlus = trimmedValue.startsWith("+");

  if (digitsOnly.length === 0) {
    return undefined;
  }

  if (startsWithPlus && !digitsOnly.startsWith("1")) {
    return undefined;
  }

  const hasUsPrefix = startsWithPlus || trimmedValue.startsWith("1");
  const nationalNumber = hasUsPrefix && digitsOnly.startsWith("1") ? digitsOnly.slice(1) : digitsOnly;

  if (nationalNumber.length !== 10) {
    return undefined;
  }

  return `+1${nationalNumber}`;
}

export function validateSubmission(
  form: InstantForm,
  input: unknown,
  submittedAt = new Date().toISOString(),
): SubmissionValidationResult {
  if (!isRecord(input) || !isRecord(input.answers)) {
    return {
      ok: false,
      errors: [{ field: "answers", message: "Answers are required." }],
    };
  }

  const errors: SubmissionValidationError[] = [];
  const answers: AnswerMap = {};

  for (const question of form.questions) {
    const rawAnswer = input.answers[question.key];
    const answer = typeof rawAnswer === "string" ? rawAnswer.trim() : "";

    if (answer.length === 0) {
      errors.push({ field: question.key, message: "This answer is required." });
      continue;
    }

    if (question.kind === "choice") {
      validateChoiceQuestion(question, answer, answers, errors);
      continue;
    }

    if (question.type === "PHONE") {
      const normalizedPhone = normalizeUsPhoneNumber(answer);

      if (!normalizedPhone) {
        errors.push({
          field: question.key,
          message: US_PHONE_VALIDATION_MESSAGE,
        });
        continue;
      }

      answers[question.key] = normalizedPhone;
      continue;
    }

    answers[question.key] = answer;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      stateCode: form.stateCode,
      formId: form.id,
      formName: form.name,
      pageId: form.page.id,
      pageName: form.page.name,
      submittedAt,
      answers,
    },
  };
}

function validateChoiceQuestion(
  question: ChoiceQuestion,
  answer: string,
  answers: AnswerMap,
  errors: SubmissionValidationError[],
): void {
  const allowedOption = question.options.some((option) => option.key === answer);

  if (!allowedOption) {
    errors.push({ field: question.key, message: "Answer is not a valid option." });
    return;
  }

  answers[question.key] = answer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
