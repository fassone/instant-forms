import { isStepVisible, type InstantForm } from "../flow";
import { US_PHONE_VALIDATION_MESSAGE, normalizeUsPhoneNumber } from "../steps/phone/us-phone";
import { validateStepSubmissionAnswer } from "../steps/adapters";

export type AnswerMap = Record<string, string>;

export type SubmissionPayload = {
  routeKey: string;
  formName: string;
  pageName: string;
  submittedAt: string;
  trustedFormCertUrl: string | null;
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
  routeKey: string,
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
  const trustedFormCertUrl = getTrustedFormCertUrl(input.trustedFormCertUrl);
  let trustedFormCertUrlError = false;
  let requiresTrustedFormCertUrl = false;

  if (input.trustedFormCertUrl !== undefined && input.trustedFormCertUrl !== null && !trustedFormCertUrl) {
    trustedFormCertUrlError = true;
    errors.push({
      field: "trustedFormCertUrl",
      message: "TrustedForm certificate URL is not valid.",
    });
  }

  for (const stepDefinition of form.steps) {
    if (!isStepVisible(stepDefinition, answers)) {
      continue;
    }

    if (stepDefinition.kind === "trusted_form_consent" && !stepDefinition.trustedForm.allowSubmitWithoutCert) {
      requiresTrustedFormCertUrl = true;
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

  if (requiresTrustedFormCertUrl && !trustedFormCertUrl && !trustedFormCertUrlError) {
    errors.push({
      field: "trustedFormCertUrl",
      message: "TrustedForm certificate URL is required.",
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      routeKey,
      formName: form.name,
      pageName: form.page.name,
      submittedAt,
      trustedFormCertUrl,
      answers,
    },
  };
}

function getTrustedFormCertUrl(input: unknown): string | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }

  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname === "cert.trustedform.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
