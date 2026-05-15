import { US_STATES } from "../../../shared/data/us-states";
import {
  getStepSlug,
  isCountedStep,
  isStepVisible,
  type AutocompleteStep,
  type FormStep,
  type InstantForm,
  type InterstitialStep,
  type PhoneStep,
  type TextStep,
  type TrustedFormConsentStep,
} from "../../flow";
import { createStateAutocompleteItems } from "../../steps/autocomplete/ranking";

type ClientStepCondition = {
  questionKey: string;
  answer: string;
};

type ClientStepBase = {
  key: string;
  slug: string;
  url: string;
  countsAsStep: boolean;
  behavior: FormStep["behavior"];
  showWhen?: ClientStepCondition;
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
      checkboxLabel: string;
      submitLabel: string;
      acceptedAnswer: TrustedFormConsentStep["acceptedAnswer"];
      validationMessage: string;
      trustedForm: TrustedFormConsentStep["trustedForm"];
      grantorSummary?: TrustedFormConsentStep["grantorSummary"];
    });

export type ClientFormConfig = {
  areaCode: string;
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
  transitionAssetUrl?: string;
};

export type ClientFormConfigOptions = {
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
  const currentStep = createClientStep(
    currentStepDefinition,
    getClientStepUrl(currentStepDefinition),
    form,
    initialAnswers,
  );
  return {
    areaCode: form.areaCode,
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
    ...(options.transitionAssetUrl ? { transitionAssetUrl: options.transitionAssetUrl } : {}),
  };
}

export function createClientTransitionSteps(
  form: InstantForm,
  getClientStepUrl: (stepDefinition: FormStep) => string,
): readonly ClientStep[] {
  return form.steps.map((stepDefinition) => createClientStep(stepDefinition, getClientStepUrl(stepDefinition), form, {}));
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
    behavior: stepDefinition.behavior,
    showWhen: stepDefinition.showWhen,
  };

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
    return {
      ...baseStep,
      kind: "interstitial",
      type: stepDefinition.type,
      loadingLabel: stepDefinition.loadingLabel,
      successLines: stepDefinition.successLines,
      completionAnswer: stepDefinition.completionAnswer,
      seenAnswer: stepDefinition.seenAnswer,
      benefits: stepDefinition.benefits,
    };
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    return {
      ...baseStep,
      kind: "trusted_form_consent",
      type: stepDefinition.type,
      checkboxLabel: stepDefinition.checkboxLabel,
      submitLabel: stepDefinition.submitLabel,
      acceptedAnswer: stepDefinition.acceptedAnswer,
      validationMessage: stepDefinition.validationMessage,
      trustedForm: stepDefinition.trustedForm,
      grantorSummary: stepDefinition.grantorSummary,
    };
  }

  return {
    ...baseStep,
    kind: "text",
    type: stepDefinition.type,
  };
}

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
