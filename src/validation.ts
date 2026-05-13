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

export function normalizeUsPhoneNumber(value: string): string | undefined {
  const digitsOnly = value.replace(/\D/g, "");

  if (digitsOnly.length !== 10) {
    return undefined;
  }

  return digitsOnly;
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
          message: "Phone number must contain exactly 10 digits.",
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
