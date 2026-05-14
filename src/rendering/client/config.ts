import { US_STATES } from "../../data/us-states";
import {
  getStepSlug,
  isCountedStep,
  type AutocompleteStep,
  type FormStep,
  type InstantForm,
  type InterstitialStep,
  type PhoneStep,
  type TextStep,
} from "../../flows";
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

type ClientStep =
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
    });

export type ClientFormConfig = {
  areaCode: string;
  activeStepIndex: number;
  initialAnswers: Record<string, string>;
  previewMode: boolean;
  steps: readonly ClientStep[];
  usStates: typeof US_STATES;
  autocompleteSources: {
    usStates: ReturnType<typeof createStateAutocompleteItems>;
  };
};

export function createClientFormConfig(
  form: InstantForm,
  activeStepIndex: number,
  initialAnswers: Record<string, string>,
  previewMode: boolean,
  getClientStepUrl: (stepDefinition: FormStep) => string,
): ClientFormConfig {
  return {
    areaCode: form.areaCode,
    activeStepIndex,
    initialAnswers,
    previewMode,
    usStates: US_STATES,
    autocompleteSources: {
      usStates: createStateAutocompleteItems(US_STATES),
    },
    steps: form.steps.map((stepDefinition) => createClientStep(stepDefinition, getClientStepUrl(stepDefinition))),
  };
}

function createClientStep(stepDefinition: FormStep, url: string): ClientStep {
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

  return {
    ...baseStep,
    kind: "text",
    type: stepDefinition.type,
  };
}
