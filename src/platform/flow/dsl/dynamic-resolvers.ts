import type {
  DynamicResolverContext,
  FormStep,
  InstantForm,
  InterstitialStep,
  TrustedFormConsentStep,
} from "./types";

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
    return getDynamicResolverDependencies(stepDefinition.grantorSummary);
  }

  return [];
}

export function hasStepDynamicResolvers(stepDefinition: FormStep): boolean {
  return getStepDynamicResolverDependencies(stepDefinition).length > 0;
}

export function canResolveStepDynamicValues(stepDefinition: FormStep, answers: Record<string, string>): boolean {
  return getStepDynamicResolverDependencies(stepDefinition).every((dependency) => Boolean(answers[dependency]));
}

export function resolveStepDynamicValues(
  form: InstantForm,
  stepDefinition: FormStep,
  answers: Record<string, string>,
): FormStep {
  if (stepDefinition.kind === "interstitial") {
    const benefits = resolveDynamicValue(form, stepDefinition.benefits, answers, []);

    return {
      ...stepDefinition,
      benefits: assertStringArray(benefits, `Resolver for step "${stepDefinition.key}" must return an array of strings.`),
    } satisfies InterstitialStep;
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    const grantorSummary = resolveDynamicValue(form, stepDefinition.grantorSummary, answers, undefined);

    return {
      ...stepDefinition,
      grantorSummary: assertTrustedFormGrantorSummary(
        grantorSummary,
        `Resolver for step "${stepDefinition.key}" must return a grantor summary object.`,
      ),
    } satisfies TrustedFormConsentStep;
  }

  return stepDefinition;
}

function resolveDynamicValue<TResult>(
  form: InstantForm,
  value: TResult | DynamicResolverContext<string, TResult> | undefined,
  answers: Record<string, string>,
  fallback: TResult,
): TResult {
  if (!isDynamicResolver(value)) {
    return value ?? fallback;
  }

  if (!value.dependencies.every((dependency) => Boolean(answers[dependency]))) {
    return fallback;
  }

  const scopedAnswers = Object.fromEntries(value.dependencies.map((dependency) => [dependency, answers[dependency] ?? ""]));

  return value.resolve({
    context: form.context,
    answers: scopedAnswers,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStringArray(value: unknown, message: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(message);
  }

  return value;
}

function assertTrustedFormGrantorSummary(
  value: unknown,
  message: string,
): { name?: string; phone?: string } | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(message);
  }

  const summary: { name?: string; phone?: string } = {};

  if (value.name !== undefined) {
    if (typeof value.name !== "string") {
      throw new Error(message);
    }
    summary.name = value.name;
  }

  if (value.phone !== undefined) {
    if (typeof value.phone !== "string") {
      throw new Error(message);
    }
    summary.phone = value.phone;
  }

  return summary;
}
