import { US_STATES } from "../../../shared/data/us-states";
import {
  getStepSlug,
  getStepDynamicResolverDependencies,
  getOptionalStepDynamicResolverDependencies,
  isCountedStep,
  isStepVisible,
  resolveStepDynamicValues,
  type AutocompleteStep,
  type ConsentDisclosureCopy,
  type FormStep,
  type FormUiCopy,
  type InstantForm,
  type InterstitialStep,
  type PhoneStep,
  type TextStep,
  type TrustedFormConsentStep,
  type TrustedFormReview,
} from "../../flow";
import { createStateAutocompleteItems } from "../../steps/autocomplete/ranking";
import { renderConsentMarkdown, renderMarkdown, type RenderedMarkdown } from "../markdown";
import type { ClientTrackingConfig } from "../tracking";

type ClientStepCondition = {
  questionKey: string;
  answer: string;
};

type ClientStepBase = {
  key: string;
  slug: string;
  url: string;
  countsAsStep: boolean;
  presentation?: FormStep["presentation"];
  behavior: FormStep["behavior"];
  showWhen?: ClientStepCondition;
  dynamicResolverDependencies?: readonly string[];
  optionalDynamicResolverDependencies?: readonly string[];
};

type ClientTrustedFormPreloadResource = {
  url: string;
  as: "script";
};

type ClientDisplayCopy = RenderedMarkdown;

export type ClientTrustedFormPreloadAsset = {
  stepKey: string;
  stepUrl: string;
  preloadAssets: TrustedFormConsentStep["trustedForm"]["preloadAssets"];
  resources: readonly ClientTrustedFormPreloadResource[];
};

export type ClientStep =
  | (ClientStepBase & {
      kind: "choice";
      options: readonly string[];
    })
  | (ClientStepBase & {
      kind: "text";
      type: TextStep["type"];
    })
  | (ClientStepBase & {
      kind: "phone";
      type: PhoneStep["type"];
    })
  | (ClientStepBase & {
      kind: "autocomplete";
      type: AutocompleteStep["type"];
      source: AutocompleteStep["source"]["clientKey"];
      validationMessage: string;
    })
  | (ClientStepBase & {
      kind: "interstitial";
      type: InterstitialStep["type"];
      loadingLabel: string;
      successLines: InterstitialStep["successLines"];
      completionAnswer: InterstitialStep["completionAnswer"];
      seenAnswer: InterstitialStep["seenAnswer"];
      benefits: readonly string[];
    })
  | (ClientStepBase & {
      kind: "trusted_form_consent";
      type: TrustedFormConsentStep["type"];
      review: Omit<TrustedFormReview, "title" | "description"> & {
        title: string;
        description?: ClientDisplayCopy;
      };
      consent: {
        title: string;
        description?: ClientDisplayCopy;
        disclosure: ClientDisplayCopy;
        checkboxLabel: string;
        submitLabel: string;
        validationMessage: string;
      };
      substeps?: TrustedFormConsentStep["substeps"];
      acceptedAnswer: TrustedFormConsentStep["acceptedAnswer"];
      trustedForm: TrustedFormConsentStep["trustedForm"];
    });

export type ClientFormConfig = {
  routeKey: string;
  locale: string;
  ui: FormUiCopy;
  customVariables: Readonly<Record<string, string>>;
  activeStepIndex: number;
  initialAnswers: Record<string, string>;
  previewMode: boolean;
  currentStep: ClientStep;
  steps: readonly ClientStep[];
  isFinalStep: boolean;
  previousUrl?: string;
  nextUrl?: string;
  stepUrlsBySlug: Record<string, string>;
  countedStepNumber: number;
  countedStepCount: number;
  usStates?: typeof US_STATES;
  autocompleteSources?: {
    usStates: ReturnType<typeof createStateAutocompleteItems>;
  };
  trustedFormPreloadAssets?: readonly ClientTrustedFormPreloadAsset[];
  tracking?: ClientTrackingConfig;
  transitionAssetUrl?: string;
};

export type ClientFormConfigOptions = {
  routeKey?: string;
  transitionAssetUrl?: string;
};

export function createClientFormConfig(
  form: InstantForm,
  activeStepIndex: number,
  initialAnswers: Record<string, string>,
  previewMode: boolean,
  getClientStepUrl: (stepDefinition: FormStep) => string,
  options: ClientFormConfigOptions = {},
): ClientFormConfig {
  const currentStepDefinition = getStepAt(form, activeStepIndex);
  const visibleStepIndexes = getVisibleStepIndexes(form, initialAnswers, previewMode);
  const visiblePosition = visibleStepIndexes.indexOf(activeStepIndex);
  const previousStepIndex = visiblePosition > 0 ? visibleStepIndexes[visiblePosition - 1] : undefined;
  const nextStepIndex = visiblePosition === -1 ? undefined : visibleStepIndexes[visiblePosition + 1];
  const countedStepIndexes = visibleStepIndexes.filter((index) => isCountedStep(getStepAt(form, index)));
  const countedStepNumber = Math.max(countedStepIndexes.filter((index) => index <= activeStepIndex).length, 1);
  const stepUrlsBySlug = Object.fromEntries(
    form.steps.map((stepDefinition) => [getStepSlug(stepDefinition), getClientStepUrl(stepDefinition)]),
  );
  const trustedFormPreloadAssets = createClientTrustedFormPreloadAssets(
    form,
    activeStepIndex,
    initialAnswers,
    previewMode,
    getClientStepUrl,
    visibleStepIndexes,
  );
  const currentStep = createClientStep(
    currentStepDefinition,
    getClientStepUrl(currentStepDefinition),
    form,
    initialAnswers,
  );
  return {
    routeKey: options.routeKey ?? "preview",
    locale: form.locale,
    ui: form.ui,
    customVariables: form.customVariables,
    activeStepIndex: 0,
    initialAnswers,
    previewMode,
    currentStep,
    steps: [currentStep],
    isFinalStep: visiblePosition === visibleStepIndexes.length - 1,
    previousUrl: previousStepIndex === undefined ? undefined : getClientStepUrl(getStepAt(form, previousStepIndex)),
    nextUrl: nextStepIndex === undefined ? undefined : getClientStepUrl(getStepAt(form, nextStepIndex)),
    stepUrlsBySlug,
    countedStepNumber,
    countedStepCount: Math.max(countedStepIndexes.length, 1),
    ...(currentStepDefinition.kind === "autocomplete" || currentStepDefinition.kind === "interstitial"
      ? {
          usStates: US_STATES,
          autocompleteSources: {
            usStates: createStateAutocompleteItems(US_STATES),
          },
        }
      : {}),
    ...(trustedFormPreloadAssets.length > 0 ? { trustedFormPreloadAssets } : {}),
    ...createClientTrackingConfig(form, options.routeKey ?? "preview", previewMode),
    ...(options.transitionAssetUrl ? { transitionAssetUrl: options.transitionAssetUrl } : {}),
  };
}

export function createClientTransitionSteps(
  form: InstantForm,
  getClientStepUrl: (stepDefinition: FormStep) => string,
): readonly ClientStep[] {
  return form.steps.map((stepDefinition) => createClientStep(stepDefinition, getClientStepUrl(stepDefinition), form, {}));
}

export function createClientResolvedStep(
  form: InstantForm,
  stepDefinition: FormStep,
  url: string,
  answers: Record<string, string>,
): ClientStep {
  return createClientStep(stepDefinition, url, form, answers);
}

function createClientStep(
  stepDefinition: FormStep,
  url: string,
  form: InstantForm,
  answers: Record<string, string>,
): ClientStep {
  const baseStep = {
    key: stepDefinition.key,
    slug: getStepSlug(stepDefinition),
    url,
    countsAsStep: isCountedStep(stepDefinition),
    ...(stepDefinition.presentation ? { presentation: stepDefinition.presentation } : {}),
    behavior: stepDefinition.behavior,
    showWhen: stepDefinition.showWhen,
    ...getDynamicResolverDependencyConfig(form, stepDefinition),
  };
  const resolvedStepDefinition = resolveStepDynamicValues(form, stepDefinition, answers);

  if (stepDefinition.kind === "choice") {
    return {
      ...baseStep,
      kind: "choice",
      options: stepDefinition.options.map((option) => option.key),
    };
  }

  if (stepDefinition.kind === "phone") {
    return {
      ...baseStep,
      kind: "phone",
      type: stepDefinition.type,
    };
  }

  if (stepDefinition.kind === "autocomplete") {
    return {
      ...baseStep,
      kind: "autocomplete",
      type: stepDefinition.type,
      source: stepDefinition.source.clientKey,
      validationMessage: stepDefinition.validationMessage,
    };
  }

  if (stepDefinition.kind === "interstitial") {
    const resolvedInterstitialStep = resolvedStepDefinition as InterstitialStep<string, undefined>;

    return {
      ...baseStep,
      kind: "interstitial",
      type: resolvedInterstitialStep.type,
      loadingLabel: resolvedInterstitialStep.loadingLabel,
      successLines: resolvedInterstitialStep.successLines,
      completionAnswer: resolvedInterstitialStep.completionAnswer,
      seenAnswer: resolvedInterstitialStep.seenAnswer,
      benefits: resolvedInterstitialStep.benefits,
    };
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    const resolvedTrustedFormStep = resolvedStepDefinition as TrustedFormConsentStep<
      string,
      undefined,
      string,
      string | undefined,
      TrustedFormReview["fields"],
      string,
      string | undefined,
      ConsentDisclosureCopy
    >;

    return {
      ...baseStep,
      kind: "trusted_form_consent",
      type: resolvedTrustedFormStep.type,
      review: {
        title: resolvedTrustedFormStep.review.title,
        ...(resolvedTrustedFormStep.review.description
          ? { description: renderDisplayCopy(resolvedTrustedFormStep.review.description) }
          : {}),
        nextLabel: resolvedTrustedFormStep.review.nextLabel,
        fields: resolvedTrustedFormStep.review.fields,
      },
      consent: {
        title: resolvedTrustedFormStep.consent.title,
        ...(resolvedTrustedFormStep.consent.description
          ? { description: renderDisplayCopy(resolvedTrustedFormStep.consent.description) }
          : {}),
        disclosure: renderConsentDisplayCopy(resolvedTrustedFormStep.consent.disclosure),
        checkboxLabel: resolvedTrustedFormStep.consent.checkboxLabel,
        submitLabel: resolvedTrustedFormStep.consent.submitLabel,
        validationMessage: resolvedTrustedFormStep.consent.validationMessage,
      },
      ...(resolvedTrustedFormStep.substeps ? { substeps: resolvedTrustedFormStep.substeps } : {}),
      acceptedAnswer: resolvedTrustedFormStep.acceptedAnswer,
      trustedForm: resolvedTrustedFormStep.trustedForm,
    };
  }

  return {
    ...baseStep,
    kind: "text",
    type: stepDefinition.type,
  };
}

function renderDisplayCopy(value: unknown): ClientDisplayCopy {
  return renderMarkdown(typeof value === "string" ? value : "");
}

function renderConsentDisplayCopy(value: unknown): ClientDisplayCopy {
  return renderConsentMarkdown(typeof value === "string" ? value : "");
}

function getDynamicResolverDependencyConfig(
  form: InstantForm,
  stepDefinition: FormStep,
): Pick<ClientStepBase, "dynamicResolverDependencies" | "optionalDynamicResolverDependencies"> {
  const dependencies = getStepDynamicResolverDependencies(stepDefinition);
  const optionalDependencies = getOptionalStepDynamicResolverDependencies(form.contract, stepDefinition);

  return dependencies.length > 0
    ? {
        dynamicResolverDependencies: dependencies,
        ...(optionalDependencies.length > 0 ? { optionalDynamicResolverDependencies: optionalDependencies } : {}),
      }
    : {};
}

function createClientTrackingConfig(
  form: InstantForm,
  routeKey: string,
  previewMode: boolean,
): { tracking: ClientTrackingConfig } | {} {
  const googleTagManager = form.tracking?.googleTagManager;
  if (previewMode || !googleTagManager) {
    return {};
  }

  const context = Object.fromEntries(
    (googleTagManager.includeContext ?? []).flatMap((key) => {
      const value = form.context[key];
      return value === undefined ? [] : [[toSnakeCase(key), value]];
    }),
  );

  return {
    tracking: {
      googleTagManager: {
        containerId: googleTagManager.containerId,
        dataLayerName: googleTagManager.dataLayerName,
        delivery: googleTagManager.delivery,
        proxy: googleTagManager.proxy,
        scriptUrl: buildGoogleTagManagerScriptUrl(googleTagManager),
        partytownLib: googleTagManager.partytownLib,
        partytownScriptUrl: googleTagManager.partytownScriptUrl,
        routeKey,
        formName: form.name,
        pageName: form.page.name,
        context,
      },
    },
  };
}

function buildGoogleTagManagerScriptUrl(
  googleTagManager: NonNullable<NonNullable<InstantForm["tracking"]>["googleTagManager"]>,
): string {
  const url = new URL(googleTagManager.scriptBaseUrl, "https://instant-form.local");
  url.searchParams.set("id", googleTagManager.containerId);
  url.searchParams.set("l", googleTagManager.dataLayerName);

  return `${url.pathname}${url.search}`;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function createClientTrustedFormPreloadAssets(
  form: InstantForm,
  activeStepIndex: number,
  answers: Record<string, string>,
  previewMode: boolean,
  getClientStepUrl: (stepDefinition: FormStep) => string,
  visibleStepIndexes = getVisibleStepIndexes(form, answers, previewMode),
): readonly ClientTrustedFormPreloadAsset[] {
  if (previewMode) {
    return [];
  }

  return form.steps.flatMap((stepDefinition, stepIndex) => {
    if (stepDefinition.kind !== "trusted_form_consent" || stepDefinition.trustedForm.preloadAssets === "never") {
      return [];
    }

    if (!shouldIncludeTrustedFormPreloadAsset(stepDefinition, stepIndex, activeStepIndex, visibleStepIndexes)) {
      return [];
    }

    const resources = getTrustedFormPreloadResources(stepDefinition.trustedForm);
    return resources.length > 0
      ? [
          {
            stepKey: stepDefinition.key,
            stepUrl: getClientStepUrl(stepDefinition),
            preloadAssets: stepDefinition.trustedForm.preloadAssets,
            resources,
          },
        ]
      : [];
  });
}

function shouldIncludeTrustedFormPreloadAsset(
  stepDefinition: TrustedFormConsentStep,
  stepIndex: number,
  activeStepIndex: number,
  visibleStepIndexes: readonly number[],
): boolean {
  if (!visibleStepIndexes.includes(stepIndex)) {
    return false;
  }

  if (stepDefinition.trustedForm.preloadAssets === "previous_step") {
    const activeVisiblePosition = visibleStepIndexes.indexOf(activeStepIndex);
    return visibleStepIndexes[activeVisiblePosition + 1] === stepIndex;
  }

  return stepIndex >= activeStepIndex;
}

function getTrustedFormPreloadResources(
  trustedForm: TrustedFormConsentStep["trustedForm"],
): readonly ClientTrustedFormPreloadResource[] {
  const sdkUrl = buildTrustedFormSdkPreloadUrl(trustedForm);
  if (!sdkUrl) {
    return [];
  }

  return [{ url: sdkUrl, as: "script" }];
}

function buildTrustedFormSdkPreloadUrl(trustedForm: TrustedFormConsentStep["trustedForm"]): string | undefined {
  const url = getSameOriginPreloadUrl(trustedForm.scriptBaseUrl);
  if (!url) {
    return undefined;
  }

  const usesProxyAliases = shouldUseTrustedFormProxyAliases(trustedForm, url);
  const fieldParam = usesProxyAliases ? "f" : "field";
  const taggedConsentParam = usesProxyAliases ? "t" : "use_tagged_consent";
  const sandboxParam = usesProxyAliases ? "s" : "sandbox";

  if (trustedForm.fieldName && !url.searchParams.has(fieldParam)) {
    url.searchParams.set(fieldParam, trustedForm.fieldName);
  }
  if (trustedForm.useTaggedConsent && !url.searchParams.has(taggedConsentParam)) {
    url.searchParams.set(taggedConsentParam, "true");
  }
  if (trustedForm.sandbox && !url.searchParams.has(sandboxParam)) {
    url.searchParams.set(sandboxParam, "true");
  }

  return `${url.pathname}${url.search}`;
}

function shouldUseTrustedFormProxyAliases(trustedForm: TrustedFormConsentStep["trustedForm"], url: URL): boolean {
  return Boolean(
    trustedForm.scriptProxyKey &&
      url.origin === trustedFormPreloadBaseUrl.origin &&
      url.pathname.endsWith(`/${trustedForm.scriptProxyKey}.js`),
  );
}

function getSameOriginPreloadPath(value: string): string | undefined {
  const url = getSameOriginPreloadUrl(value);
  return url ? `${url.pathname}${url.search}` : undefined;
}

function getSameOriginPreloadUrl(value: string): URL | undefined {
  const url = new URL(value, trustedFormPreloadBaseUrl);
  return url.origin === trustedFormPreloadBaseUrl.origin ? url : undefined;
}

const trustedFormPreloadBaseUrl = new URL("https://instant.local");

function getVisibleStepIndexes(form: InstantForm, answers: Record<string, string>, previewMode: boolean): number[] {
  return form.steps
    .map((stepDefinition, index) => (previewMode || isStepVisible(stepDefinition, answers) ? index : -1))
    .filter((index) => index !== -1);
}

function getStepAt(form: InstantForm, index: number): FormStep {
  const stepDefinition = form.steps[index];

  if (!stepDefinition) {
    throw new Error(`Missing step at index ${index}.`);
  }

  return stepDefinition;
}
