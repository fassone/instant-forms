import {
  isStepVisible,
  resolveStepDynamicValues,
  type FormContract,
  type FormPayloadBrowserContext,
  type FormPayloadCookieHelpers,
  type FormPayloadRequestContext,
  type InstantForm,
  type TrustedFormConsentStep,
} from "../flow";
import { renderConsentMarkdown } from "../rendering/markdown";
import { normalizeUsPhoneNumber } from "../steps/phone/us-phone";
import { validateStepSubmissionAnswer, type StepAnswerValue } from "../steps/adapters";

export type JsonPayloadValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonPayloadValue[]
  | { readonly [key: string]: JsonPayloadValue };
export type JsonPayloadObject = { readonly [key: string]: JsonPayloadValue };
export type AnswerMap = Record<string, JsonPayloadValue>;
export type DeliveryPayload =
  | {
      url: string;
      method: "POST";
      encoding: "json";
      payload: JsonPayloadObject;
    }
  | {
      url: string;
      method: "POST";
      encoding: "form_urlencoded";
      payload: Record<string, string>;
    };
export type SubmissionMappingContext = {
  cookies?: FormPayloadCookieHelpers;
  request?: FormPayloadRequestContext;
  browser?: FormPayloadBrowserContext;
};

const EMPTY_SUBMISSION_MAPPING_CONTEXT: Required<SubmissionMappingContext> = {
  cookies: {
    get: () => undefined,
  },
  request: {
    url: "",
  },
  browser: {},
};

type SubmissionContext = {
  id: string;
  submittedAt: string;
};

type DeliveryResolutionInput = {
  answers: AnswerMap;
  submission: SubmissionContext;
  mappingContext: Required<SubmissionMappingContext>;
};

type FormUrlencodedDeliveryPayload = {
  url: string;
  method: "POST";
  encoding: "form_urlencoded";
  payload: Record<string, string>;
};

type JsonDeliveryPayload = {
  url: string;
  method: "POST";
  encoding: "json";
  payload: JsonPayloadObject;
};

export type SubmissionPayload = {
  routeKey: string;
  submissionId: string;
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
  submissionId = crypto.randomUUID(),
  mappingContext: SubmissionMappingContext = {},
): SubmissionValidationResult {
  if (!isRecord(input) || !isRecord(input.answers)) {
    return {
      ok: false,
      errors: [{ field: "answers", message: form.ui.errors.submissionFailed }],
    };
  }

  const errors: SubmissionValidationError[] = [];
  const answers: Record<string, JsonPayloadValue> = {};
  const visibilityAnswers: Record<string, string> = {};
  const trustedFormCertUrlCandidate = getTrustedFormCertUrlCandidate(form, input);
  const trustedFormCertUrl = trustedFormCertUrlCandidate.value;
  let requiresTrustedFormCertUrl = false;

  if (trustedFormCertUrlCandidate.invalid) {
    errors.push({
      field: "trustedFormCertUrl",
      message: form.ui.errors.trustedFormCertFailed,
    });
  }

  for (const stepDefinition of form.steps) {
    if (!isStepVisible(stepDefinition, visibilityAnswers)) {
      continue;
    }

    if (stepDefinition.kind === "trusted_form_consent" && !stepDefinition.trustedForm.allowSubmitWithoutCert) {
      requiresTrustedFormCertUrl = true;
    }

    const submissionStepDefinition =
      stepDefinition.kind === "trusted_form_consent"
        ? getTrustedFormSubmissionStep(form, stepDefinition, visibilityAnswers)
        : stepDefinition;
    const validationInput =
      submissionStepDefinition.kind === "trusted_form_consent"
        ? getTrustedFormConsentSubmissionInput(
            input.answers[submissionStepDefinition.key],
            trustedFormCertUrl,
            getTrustedFormConsentDisclosureText(submissionStepDefinition),
          )
        : input.answers[stepDefinition.key];
    const validation = validateStepSubmissionAnswer(submissionStepDefinition, validationInput, form.ui.errors);

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

    answers[stepDefinition.key] = normalizeStepAnswerValue(validation.answer, stepDefinition.key);
    visibilityAnswers[stepDefinition.key] = validation.visibilityAnswer ?? getVisibilityAnswer(validation.answer);
  }

  if (requiresTrustedFormCertUrl && !trustedFormCertUrl && !trustedFormCertUrlCandidate.invalid) {
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

  const deliveryResolution = resolveDeliveryPayload(form, {
    answers: answerContractValidation.answers,
    submission: {
      id: submissionId,
      submittedAt,
    },
    mappingContext: normalizeSubmissionMappingContext(mappingContext),
  });

  if (!deliveryResolution.ok) {
    return { ok: false, errors: deliveryResolution.errors };
  }

  return {
    ok: true,
    payload: {
      routeKey,
      submissionId,
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
  answers: Readonly<Record<string, JsonPayloadValue>>,
): { ok: true; answers: AnswerMap } | { ok: false; errors: SubmissionValidationError[] } {
  const validation = form.contract.answers.safeParse(answers);

  if (!validation.success) {
    return {
      ok: false,
      errors: [{ field: "answers", message: "Submission answers do not match the flow contract." }],
    };
  }

  return { ok: true, answers: normalizeJsonPayloadObject(validation.data, "answers") };
}

function resolveDeliveryPayload(
  form: InstantForm,
  input: DeliveryResolutionInput,
): { ok: true; delivery: DeliveryPayload } | { ok: false; errors: SubmissionValidationError[] } {
  let mappedPayload: unknown;

  try {
    mappedPayload = form.payload.mapping({
      context: form.context,
      answers: input.answers,
      submission: input.submission,
      cookies: input.mappingContext.cookies,
      request: input.mappingContext.request,
      browser: input.mappingContext.browser,
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

  try {
    return {
      ok: true,
      delivery: createDeliveryPayload(form, validation.data),
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          field: "delivery.payload",
          message: error instanceof Error ? error.message : "Delivery payload does not match the flow contract.",
        },
      ],
    };
  }
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

function getTrustedFormCertUrlCandidate(
  form: InstantForm,
  input: Record<string, unknown>,
): { value: string | null; invalid: boolean } {
  const candidates = [
    input.trustedFormCertUrl,
    ...form.steps.flatMap((stepDefinition) => {
      if (stepDefinition.kind !== "trusted_form_consent") {
        return [];
      }

      const answer = isRecord(input.answers) ? input.answers[stepDefinition.key] : undefined;
      return isRecord(answer) ? [answer.trustedform_certificate_url] : [];
    }),
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") {
      continue;
    }

    const trustedFormCertUrl = getTrustedFormCertUrl(candidate);
    if (trustedFormCertUrl) {
      return { value: trustedFormCertUrl, invalid: false };
    }

    return { value: null, invalid: true };
  }

  return { value: null, invalid: false };
}

function getTrustedFormSubmissionStep(
  form: InstantForm,
  stepDefinition: TrustedFormConsentStep,
  answers: Record<string, string>,
): TrustedFormConsentStep {
  const resolvedStepDefinition = resolveStepDynamicValues(form, stepDefinition, answers);
  return resolvedStepDefinition.kind === "trusted_form_consent" ? resolvedStepDefinition : stepDefinition;
}

function getTrustedFormConsentDisclosureText(stepDefinition: TrustedFormConsentStep): string {
  return renderConsentMarkdown(stepDefinition.consent.disclosure).text;
}

function getTrustedFormConsentSubmissionInput(
  input: unknown,
  trustedFormCertUrl: string | null,
  consentDisclosureText: string,
): unknown {
  if (isRecord(input)) {
    const accepted = getTrustedFormAcceptedAnswer(input);

    return {
      ...input,
      ...(accepted ? { accepted } : {}),
      consent: consentDisclosureText,
      ...(trustedFormCertUrl ? { trustedform_certificate_url: trustedFormCertUrl } : {}),
    };
  }

  return {
    accepted: input,
    consent: consentDisclosureText,
    ...(trustedFormCertUrl ? { trustedform_certificate_url: trustedFormCertUrl } : {}),
  };
}

function getTrustedFormAcceptedAnswer(input: Record<string, unknown>): string {
  return typeof input.accepted === "string"
    ? input.accepted.trim()
    : typeof input.consent === "string" && input.consent.trim() === "accepted"
      ? input.consent.trim()
      : "";
}

function normalizeStepAnswerValue(answer: StepAnswerValue, context: string): JsonPayloadValue {
  const normalizedAnswer = normalizeJsonPayloadValue(answer, `answers.${context}`);
  if (normalizedAnswer === undefined) {
    throw new Error(`answers.${context} must not be undefined.`);
  }

  return normalizedAnswer;
}

function getVisibilityAnswer(answer: StepAnswerValue): string {
  return typeof answer === "string" ? answer : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getUnknownSchemaKeys(schema: FormContract["payload"], input: Record<string, unknown>): string[] {
  const knownKeys = new Set(Object.keys(schema.shape));

  return Object.keys(input).filter((key) => !knownKeys.has(key));
}

function normalizeSubmissionMappingContext(input: SubmissionMappingContext): Required<SubmissionMappingContext> {
  return {
    cookies: input.cookies ?? EMPTY_SUBMISSION_MAPPING_CONTEXT.cookies,
    request: input.request ?? EMPTY_SUBMISSION_MAPPING_CONTEXT.request,
    browser: input.browser ?? EMPTY_SUBMISSION_MAPPING_CONTEXT.browser,
  };
}

function createDeliveryPayload(form: InstantForm, input: Readonly<Record<string, unknown>>): DeliveryPayload {
  if (form.payload.encoding === "form_urlencoded") {
    return {
      url: form.payload.url,
      method: form.payload.method,
      encoding: form.payload.encoding,
      payload: stringifyPayloadMap(input, "delivery.payload"),
    } satisfies FormUrlencodedDeliveryPayload;
  }

  return {
    url: form.payload.url,
    method: form.payload.method,
    encoding: form.payload.encoding,
    payload: normalizeJsonPayloadObject(input, "delivery.payload"),
  } satisfies JsonDeliveryPayload;
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

function normalizeJsonPayloadObject(input: Readonly<Record<string, unknown>>, context: string): JsonPayloadObject {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      const normalizedValue = normalizeJsonPayloadValue(value, `${context}.${key}`);

      return normalizedValue === undefined ? [] : [[key, normalizedValue]];
    }),
  );
}

function normalizeJsonPayloadValue(value: unknown, context: string): JsonPayloadValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${context} must be a finite number.`);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const normalizedItem = normalizeJsonPayloadValue(item, `${context}[${index}]`);
      if (normalizedItem === undefined) {
        throw new Error(`${context}[${index}] must not be undefined.`);
      }

      return normalizedItem;
    });
  }

  if (isRecord(value)) {
    return normalizeJsonPayloadObject(value, context);
  }

  throw new Error(`${context} must be JSON-serializable.`);
}
