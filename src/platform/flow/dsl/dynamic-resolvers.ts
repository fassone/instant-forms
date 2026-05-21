import type {
  DynamicResolverContext,
  FormContract,
  FormStep,
  InstantForm,
  InterstitialStep,
  InterstitialStepDynamicBody,
  ConsentMarkdownValue,
  TrustedFormReviewField,
  TrustedFormConsentFieldRole,
  TrustedFormConsentStep,
  TrustedFormConsentStepDynamicBody,
} from "./types";

type AnswerSchema = Record<string, unknown> & {
  safeParse: (input: unknown) => { success: boolean };
};

export function isDynamicResolver(value: unknown): value is DynamicResolverContext<string, unknown> {
  return isRecord(value) && value.__kind === "dynamic_resolver" && Array.isArray(value.dependencies);
}

export function getDynamicResolverDependencies(value: unknown): readonly string[] {
  return isDynamicResolver(value) ? value.dependencies : [];
}

export function getStepDynamicResolverDependencies(stepDefinition: FormStep): readonly string[] {
  return getDynamicResolverDependencies(getStepDynamicResolver(stepDefinition));
}

export function getOptionalStepDynamicResolverDependencies(
  contract: FormContract,
  stepDefinition: FormStep,
): readonly string[] {
  return getStepDynamicResolverDependencies(stepDefinition).filter((dependency) =>
    isOptionalAnswerDependency(contract, dependency),
  );
}

export function hasStepDynamicResolvers(stepDefinition: FormStep): boolean {
  return getStepDynamicResolverDependencies(stepDefinition).length > 0;
}

export function canResolveStepDynamicValues(
  form: InstantForm,
  stepDefinition: FormStep,
  answers: Record<string, string>,
): boolean {
  return getStepDynamicResolverDependencies(stepDefinition).every(
    (dependency) => isOptionalAnswerDependency(form.contract, dependency) || Boolean(answers[dependency]),
  );
}

export function resolveStepDynamicValues(
  form: InstantForm,
  stepDefinition: FormStep,
  answers: Record<string, string>,
): FormStep {
  const resolver = getStepDynamicResolver(stepDefinition);

  if (!resolver) {
    return stepDefinition;
  }

  if (!resolver.dependencies.every((dependency) => isOptionalAnswerDependency(form.contract, dependency) || Boolean(answers[dependency]))) {
    return stepDefinition;
  }

  const scopedAnswers = Object.fromEntries(resolver.dependencies.map((dependency) => [dependency, answers[dependency]]));
  const resolvedBody = resolver.resolve({
    context: form.context,
    answers: scopedAnswers as Readonly<Record<string, string>>,
  });

  assertSafeResolvedOutput(resolvedBody, `Resolver for step "${stepDefinition.key}"`);

  if (stepDefinition.kind === "interstitial") {
    return mergeInterstitialStepDynamicBody(stepDefinition, resolvedBody, stepDefinition.key);
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    return mergeTrustedFormConsentStepDynamicBody(stepDefinition, resolvedBody, stepDefinition.key);
  }

  return stepDefinition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalAnswerDependency(contract: FormContract, key: string): boolean {
  return getAnswerSchema(contract, key)?.safeParse(undefined).success === true;
}

function getAnswerSchema(contract: FormContract, key: string): AnswerSchema | undefined {
  const schema = contract.answers.shape[key];

  if (!isRecord(schema) || typeof (schema as { safeParse?: unknown }).safeParse !== "function") {
    return undefined;
  }

  return schema as unknown as AnswerSchema;
}

function getStepDynamicResolver(stepDefinition: FormStep): DynamicResolverContext<string, unknown> | undefined {
  return "dynamic" in stepDefinition && isDynamicResolver(stepDefinition.dynamic) ? stepDefinition.dynamic : undefined;
}

function mergeInterstitialStepDynamicBody(
  stepDefinition: InterstitialStep,
  value: unknown,
  stepKey: string,
): InterstitialStep {
  if (!isRecord(value)) {
    throw new Error(`Resolver for step "${stepKey}" must return an interstitial body object.`);
  }
  assertOnlyKeys(value, ["label", "loadingLabel", "successLines", "benefits"], `Resolver for step "${stepKey}" cannot return static step fields.`);

  const body = value as Partial<InterstitialStepDynamicBody>;
  const benefits = assertStringArray(body.benefits, `Resolver for step "${stepKey}" field "benefits" must return an array of strings.`);
  const loadingLabel =
    body.loadingLabel === undefined
      ? stepDefinition.loadingLabel
      : assertString(body.loadingLabel, `Resolver for step "${stepKey}" field "loadingLabel" must return text.`);
  const successLines =
    body.successLines === undefined
      ? stepDefinition.successLines
      : assertInterstitialSuccessLines(body.successLines, `Resolver for step "${stepKey}" field "successLines" is invalid.`);
  const label =
    body.label === undefined
      ? stepDefinition.label
      : assertString(body.label, `Resolver for step "${stepKey}" field "label" must return text.`);

  return {
    ...stepDefinition,
    label,
    loadingLabel,
    successLines,
    benefits,
  };
}

function mergeTrustedFormConsentStepDynamicBody(
  stepDefinition: TrustedFormConsentStep,
  value: unknown,
  stepKey: string,
): TrustedFormConsentStep {
  if (!isRecord(value) || !isRecord(value.review) || !isRecord(value.consent)) {
    throw new Error(`Resolver for step "${stepKey}" must return review and consent body objects.`);
  }
  assertOnlyKeys(value, ["review", "consent"], `Resolver for step "${stepKey}" cannot return static step fields.`);
  assertOnlyKeys(
    value.review,
    ["title", "description", "nextLabel", "fields"],
    `Resolver for step "${stepKey}" field "review" cannot return static step fields.`,
  );
  assertOnlyKeys(
    value.consent,
    ["title", "description", "disclosure", "checkboxLabel", "submitLabel", "validationMessage"],
    `Resolver for step "${stepKey}" field "consent" cannot return static step fields.`,
  );

  const reviewFields = assertTrustedFormReviewFields(
    value.review.fields,
    `Resolver for step "${stepKey}" field "review.fields" must return at least one review field.`,
  );
  const reviewTitle = assertString(
    value.review.title,
    `Resolver for step "${stepKey}" field "review.title" must return text.`,
  );
  const consentTitle = assertString(
    value.consent.title,
    `Resolver for step "${stepKey}" field "consent.title" must return text.`,
  );
  const disclosure = assertString(
    value.consent.disclosure,
    `Resolver for step "${stepKey}" field "consent.disclosure" must return markdown text.`,
  );
  const reviewDescription =
    value.review.description === undefined
      ? undefined
      : assertString(value.review.description, `Resolver for step "${stepKey}" field "review.description" must return markdown text.`);
  const consentDescription =
    value.consent.description === undefined
      ? undefined
      : assertString(value.consent.description, `Resolver for step "${stepKey}" field "consent.description" must return markdown text.`);

  return {
    ...stepDefinition,
    review: {
      ...stepDefinition.review,
      title: reviewTitle,
      ...(reviewDescription === undefined ? {} : { description: reviewDescription }),
      nextLabel:
        value.review.nextLabel === undefined
          ? stepDefinition.review.nextLabel
          : assertString(value.review.nextLabel, `Resolver for step "${stepKey}" field "review.nextLabel" must return text.`),
      fields: reviewFields,
    },
    consent: {
      ...stepDefinition.consent,
      title: consentTitle,
      ...(consentDescription === undefined ? {} : { description: consentDescription }),
      disclosure: disclosure as ConsentMarkdownValue,
      checkboxLabel:
        value.consent.checkboxLabel === undefined
          ? stepDefinition.consent.checkboxLabel
          : assertString(value.consent.checkboxLabel, `Resolver for step "${stepKey}" field "consent.checkboxLabel" must return text.`),
      submitLabel:
        value.consent.submitLabel === undefined
          ? stepDefinition.consent.submitLabel
          : assertString(value.consent.submitLabel, `Resolver for step "${stepKey}" field "consent.submitLabel" must return text.`),
      validationMessage:
        value.consent.validationMessage === undefined
          ? stepDefinition.consent.validationMessage
          : assertString(
              value.consent.validationMessage,
              `Resolver for step "${stepKey}" field "consent.validationMessage" must return text.`,
            ),
    },
  };
}

function assertStringArray(value: unknown, message: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(message);
  }

  return value;
}

function assertInterstitialSuccessLines(value: unknown, message: string): InterstitialStep["successLines"] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (line) =>
        isRecord(line) &&
        typeof line.text === "string" &&
        (line.color === "brand-navy" || line.color === "accent"),
    )
  ) {
    throw new Error(message);
  }

  return value.map((line) => ({
    text: line.text as string,
    color: line.color as "brand-navy" | "accent",
  }));
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new Error(message);
  }

  return value;
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[], message: string): void {
  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));

  if (unknownKeys.length > 0) {
    throw new Error(`${message} Unknown fields: ${unknownKeys.join(", ")}.`);
  }
}

function assertTrustedFormReviewFields(value: unknown, message: string): readonly TrustedFormReviewField[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(message);
  }

  return value.map((field) => assertTrustedFormReviewField(field, message));
}

function assertTrustedFormReviewField(value: unknown, message: string): TrustedFormReviewField {
  if (!isRecord(value)) {
    throw new Error(message);
  }

  if (
    typeof value.name !== "string" ||
    typeof value.label !== "string" ||
    typeof value.value !== "string"
  ) {
    throw new Error(message);
  }

  const trustedForm =
    value.trustedForm === undefined
      ? undefined
      : isRecord(value.trustedForm) && isTrustedFormConsentFieldRole(value.trustedForm.role)
        ? { role: value.trustedForm.role }
        : undefined;

  if (value.trustedForm !== undefined && !trustedForm) {
    throw new Error(message);
  }

  return {
    name: value.name,
    label: value.label,
    value: value.value,
    ...(trustedForm ? { trustedForm } : {}),
  };
}

function isTrustedFormConsentFieldRole(value: unknown): value is TrustedFormConsentFieldRole {
  return value === "consent-grantor-name" || value === "consent-grantor-phone" || value === "consent-grantor-email";
}

function assertSafeResolvedOutput(value: unknown, path: string): void {
  if (value === undefined || value === null) {
    throw new Error(`${path} returned ${String(value)}. Resolver output cannot contain undefined or null.`);
  }

  if (typeof value === "string") {
    if (/(^|[^A-Za-z0-9_])(undefined|null)(?=$|[^A-Za-z0-9_])/u.test(value)) {
      throw new Error(`${path} returned unresolved text "${value}". Use text(...) with an explicit fallback.`);
    }
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSafeResolvedOutput(item, `${path}[${index}]`);
    });
    return;
  }

  if (isRecord(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      assertSafeResolvedOutput(nestedValue, `${path}.${key}`);
    }
  }
}
