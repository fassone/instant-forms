import type {
  DynamicResolverContext,
  FormContract,
  FormStep,
  InstantForm,
  InterstitialStep,
  TrustedFormConfirmationField,
  TrustedFormConsentFieldRole,
  TrustedFormConsentStep,
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
  if (stepDefinition.kind === "interstitial") {
    return getDynamicResolverDependencies(stepDefinition.benefits);
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    return getDynamicResolverDependencies(stepDefinition.confirmation.fields);
  }

  return [];
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
  if (stepDefinition.kind === "interstitial") {
    const benefits = resolveDynamicValue(form, stepDefinition.benefits, answers, [], stepDefinition.key, "benefits");

    return {
      ...stepDefinition,
      benefits: assertStringArray(benefits, `Resolver for step "${stepDefinition.key}" must return an array of strings.`),
    } satisfies InterstitialStep;
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    const confirmationFields = resolveDynamicValue(
      form,
      stepDefinition.confirmation.fields,
      answers,
      undefined,
      stepDefinition.key,
      "confirmation.fields",
    );

    return {
      ...stepDefinition,
      confirmation: {
        ...stepDefinition.confirmation,
        fields:
          confirmationFields === undefined
            ? stepDefinition.confirmation.fields
            : assertTrustedFormConfirmationFields(
                confirmationFields,
                `Resolver for step "${stepDefinition.key}" must return at least one confirmation field.`,
              ),
      },
    } satisfies TrustedFormConsentStep;
  }

  return stepDefinition;
}

function resolveDynamicValue<TResult>(
  form: InstantForm,
  value: TResult | DynamicResolverContext<string, TResult> | undefined,
  answers: Record<string, string>,
  fallback: TResult,
  stepKey: string,
  fieldName: string,
): TResult {
  if (!isDynamicResolver(value)) {
    return value ?? fallback;
  }

  if (!value.dependencies.every((dependency) => isOptionalAnswerDependency(form.contract, dependency) || Boolean(answers[dependency]))) {
    return fallback;
  }

  const scopedAnswers = Object.fromEntries(value.dependencies.map((dependency) => [dependency, answers[dependency]]));

  const resolvedValue = value.resolve({
    context: form.context,
    answers: scopedAnswers as Readonly<Record<string, string>>,
  });

  assertSafeResolvedOutput(resolvedValue, `Resolver for step "${stepKey}" field "${fieldName}"`);

  return resolvedValue;
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

function assertStringArray(value: unknown, message: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(message);
  }

  return value;
}

function assertTrustedFormConfirmationFields(value: unknown, message: string): readonly TrustedFormConfirmationField[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(message);
  }

  return value.map((field) => assertTrustedFormConfirmationField(field, message));
}

function assertTrustedFormConfirmationField(value: unknown, message: string): TrustedFormConfirmationField {
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
