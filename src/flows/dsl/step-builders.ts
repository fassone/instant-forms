import { US_STATE_VALIDATION_MESSAGE, normalizeUsState } from "../../data/us-states";
import type {
  AutocompleteSourceDefinition,
  AutocompleteStep,
  AutocompleteStepInput,
  BaseStep,
  BaseStepInput,
  CheckpointMode,
  ChoiceStep,
  ChoiceStepInput,
  InterstitialStep,
  InterstitialStepInput,
  PhoneStep,
  PhoneStepInput,
  StepBehavior,
  StepTemplateKey,
  TextStep,
  TextStepInput,
} from "./types";

export const autocompleteSource = {
  usStates(): AutocompleteSourceDefinition {
    return {
      key: "us_states",
      clientKey: "usStates",
      normalize: normalizeUsState,
      validationMessage: US_STATE_VALIDATION_MESSAGE,
    };
  },
} as const;

export const step = {
  choice(input: ChoiceStepInput): ChoiceStep {
    return {
      ...baseStep(input, "choice", "answer", { autoAdvance: true }),
      kind: "choice",
      type: "CUSTOM",
      options: input.options.map((option) => ({ key: option.key, value: option.label })),
    };
  },

  text(input: TextStepInput): TextStep {
    return {
      ...baseStep(input, "text", "answer", { mobileBlurSubmit: true }),
      kind: "text",
      type: input.type ?? "FIRST_NAME",
      autocomplete: input.autocomplete,
      inputMode: "text",
    };
  },

  phone(input: PhoneStepInput): PhoneStep {
    return {
      ...baseStep(input, "phone", "answer", { mask: "us_phone", mobileBlurSubmit: true }),
      kind: "phone",
      type: "PHONE",
      autocomplete: "tel",
      inputMode: "tel",
    };
  },

  autocomplete(input: AutocompleteStepInput): AutocompleteStep {
    return {
      ...baseStep(input, "autocomplete", "answer", { suggestions: "autocomplete" }),
      kind: "autocomplete",
      type: "AUTOCOMPLETE",
      autocomplete: input.autocomplete,
      inputMode: input.inputMode ?? "text",
      source: input.source,
      validationMessage: input.validationMessage ?? input.source.validationMessage,
      normalize: input.normalize ?? input.source.normalize,
    };
  },

  interstitial(input: InterstitialStepInput): InterstitialStep {
    return {
      ...baseStep(input, "interstitial", "checkpoint_only", { interstitialTiming: "matching_offer" }),
      kind: "interstitial",
      type: "INTERSTITIAL",
      loadingLabel: input.loadingLabel ?? "",
      successLines: input.successLines,
      completionAnswer: input.completionAnswer ?? "completed",
      seenAnswer: input.seenAnswer ?? "seen",
      benefits: input.benefits,
    };
  },
} as const;

function baseStep(
  input: BaseStepInput,
  template: StepTemplateKey,
  checkpointMode: CheckpointMode,
  behavior: StepBehavior,
): BaseStep {
  return {
    key: input.key,
    slug: input.slug,
    label: input.label,
    id: input.id ?? input.key,
    template,
    checkpointMode,
    behavior,
    countsAsStep: input.countsAsStep,
    showWhen: input.showWhen,
  };
}
