import { isStepVisible, type InstantForm } from "../flows";
import { US_PHONE_VALIDATION_MESSAGE, normalizeUsPhoneNumber } from "../steps/phone/us-phone";
import { validateStepSubmissionAnswer } from "../steps/adapters";

export type AnswerMap = Record<string, string>;

export type SubmissionPayload = {
  areaCode: string;
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

export { US_PHONE_VALIDATION_MESSAGE, normalizeUsPhoneNumber };

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

  for (const stepDefinition of form.steps) {
    if (!isStepVisible(stepDefinition, answers)) {
      continue;
    }

    const validation = validateStepSubmissionAnswer(stepDefinition, input.answers[stepDefinition.key]);

    if (!validation.ok) {
      errors.push({
        field: stepDefinition.key,
        message: validation.message === "Esta respuesta es requerida." ? "This answer is required." : validation.message,
      });
      continue;
    }

    if (!validation.includeInSubmission) {
      continue;
    }

    answers[stepDefinition.key] = validation.answer;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      areaCode: form.areaCode,
      formId: form.id,
      formName: form.name,
      pageId: form.page.id,
      pageName: form.page.name,
      submittedAt,
      answers,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
