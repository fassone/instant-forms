import { isStepVisible, type FormContract, type InstantForm } from "../flow";
import { normalizeUsPhoneNumber } from "../steps/phone/us-phone";
import { validateStepSubmissionAnswer } from "../steps/adapters";

export type AnswerMap = Record<string, string>;
export type DeliveryPayload = {
  method: "POST";
  encoding: "json" | "form_urlencoded";
  payload: Record<string, string>;
};

export type SubmissionPayload = {
  routeKey: string;
  formName: string;
  pageName: string;
  submittedAt: string;
  trustedFormCertUrl: string | null;
  delivery: DeliveryPayload;
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

export { normalizeUsPhoneNumber };

export function validateSubmission(
  form: InstantForm,
  routeKey: string,
  input: unknown,
  submittedAt = new Date().toISOString(),
): SubmissionValidationResult {
  if (!isRecord(input) || !isRecord(input.answers)) {
    return {
      ok: false,
      errors: [{ field: "answers", message: form.ui.errors.submissionFailed }],
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
      message: form.ui.errors.trustedFormCertFailed,
    });
  }

  for (const stepDefinition of form.steps) {
    if (!isStepVisible(stepDefinition, answers)) {
      continue;
    }

    if (stepDefinition.kind === "trusted_form_consent" && !stepDefinition.trustedForm.allowSubmitWithoutCert) {
      requiresTrustedFormCertUrl = true;
    }

    const validation = validateStepSubmissionAnswer(stepDefinition, input.answers[stepDefinition.key], form.ui.errors);

    if (!validation.ok) {
      errors.push({
        field: stepDefinition.key,
        message: validation.message,
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
      message: form.ui.errors.trustedFormCertFailed,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const answerContractValidation = validateContractAnswers(form, answers);

  if (!answerContractValidation.ok) {
    return { ok: false, errors: answerContractValidation.errors };
  }

  const deliveryResolution = resolveDeliveryPayload(form, answerContractValidation.answers);

  if (!deliveryResolution.ok) {
    return { ok: false, errors: deliveryResolution.errors };
  }

  return {
    ok: true,
    payload: {
      routeKey,
      formName: form.name,
      pageName: form.page.name,
      submittedAt,
      trustedFormCertUrl,
      delivery: deliveryResolution.delivery,
      answers: answerContractValidation.answers,
    },
  };
}

function validateContractAnswers(
  form: InstantForm,
  answers: AnswerMap,
): { ok: true; answers: AnswerMap } | { ok: false; errors: SubmissionValidationError[] } {
  const validation = form.contract.answers.safeParse(answers);

  if (!validation.success) {
    return {
      ok: false,
      errors: [{ field: "answers", message: "Submission answers do not match the flow contract." }],
    };
  }

  return { ok: true, answers: stringifyPayloadMap(validation.data, "answers") };
}

function resolveDeliveryPayload(
  form: InstantForm,
  answers: AnswerMap,
): { ok: true; delivery: DeliveryPayload } | { ok: false; errors: SubmissionValidationError[] } {
  let mappedPayload: unknown;

  try {
    mappedPayload = form.payload.mapping({
      context: form.context,
      answers,
    });
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          field: "delivery.payload",
          message: error instanceof Error ? error.message : "Could not build the delivery payload.",
        },
      ],
    };
  }

  if (!isRecord(mappedPayload)) {
    return {
      ok: false,
      errors: [{ field: "delivery.payload", message: "Delivery payload must be an object." }],
    };
  }

  const unknownKeys = getUnknownSchemaKeys(form.contract.payload, mappedPayload);

  if (unknownKeys.length > 0) {
    return {
      ok: false,
      errors: [{ field: "delivery.payload", message: `Delivery payload includes undeclared keys: ${unknownKeys.join(", ")}.` }],
    };
  }

  const validation = form.contract.payload.safeParse(mappedPayload);

  if (!validation.success) {
    return {
      ok: false,
      errors: [{ field: "delivery.payload", message: "Delivery payload does not match the flow contract." }],
    };
  }

  return {
    ok: true,
    delivery: {
      method: form.payload.method,
      encoding: form.payload.encoding,
      payload: stringifyPayloadMap(validation.data, "delivery.payload"),
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

function getUnknownSchemaKeys(schema: FormContract["payload"], input: Record<string, unknown>): string[] {
  const knownKeys = new Set(Object.keys(schema.shape));

  return Object.keys(input).filter((key) => !knownKeys.has(key));
}

function stringifyPayloadMap(input: Readonly<Record<string, unknown>>, context: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .filter((entry): entry is [string, unknown] => entry[1] !== undefined)
      .map(([key, value]) => {
        if (typeof value !== "string") {
          throw new Error(`${context}.${key} must resolve to a string.`);
        }

        return [key, value];
      }),
  );
}
