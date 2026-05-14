import { autocompleteAdapter } from "./autocomplete";
import { choiceAdapter } from "./choice";
import { interstitialAdapter } from "./interstitial";
import { phoneAdapter } from "./phone";
import { textAdapter } from "./text";
import type { FormStep } from "../../flow";

export type StepValidationResult =
  | {
      ok: true;
      answer: string;
      includeInSubmission: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export type StepAdapter<TStep extends FormStep> = {
  kind: TStep["kind"];
  validateCheckpoint: (stepDefinition: TStep, input: unknown) => StepValidationResult;
  validateSubmission: (stepDefinition: TStep, input: unknown) => StepValidationResult;
  isAnswered: (stepDefinition: TStep, answers: Record<string, string>) => boolean;
};

export function validateStepCheckpointAnswer(stepDefinition: FormStep, input: unknown): StepValidationResult {
  switch (stepDefinition.kind) {
    case "choice":
      return choiceAdapter.validateCheckpoint(stepDefinition, input);
    case "text":
      return textAdapter.validateCheckpoint(stepDefinition, input);
    case "phone":
      return phoneAdapter.validateCheckpoint(stepDefinition, input);
    case "autocomplete":
      return autocompleteAdapter.validateCheckpoint(stepDefinition, input);
    case "interstitial":
      return interstitialAdapter.validateCheckpoint(stepDefinition, input);
  }
}

export function validateStepSubmissionAnswer(stepDefinition: FormStep, input: unknown): StepValidationResult {
  switch (stepDefinition.kind) {
    case "choice":
      return choiceAdapter.validateSubmission(stepDefinition, input);
    case "text":
      return textAdapter.validateSubmission(stepDefinition, input);
    case "phone":
      return phoneAdapter.validateSubmission(stepDefinition, input);
    case "autocomplete":
      return autocompleteAdapter.validateSubmission(stepDefinition, input);
    case "interstitial":
      return interstitialAdapter.validateSubmission(stepDefinition, input);
  }
}

export function isStepAnswered(stepDefinition: FormStep, answers: Record<string, string>): boolean {
  switch (stepDefinition.kind) {
    case "choice":
      return choiceAdapter.isAnswered(stepDefinition, answers);
    case "text":
      return textAdapter.isAnswered(stepDefinition, answers);
    case "phone":
      return phoneAdapter.isAnswered(stepDefinition, answers);
    case "autocomplete":
      return autocompleteAdapter.isAnswered(stepDefinition, answers);
    case "interstitial":
      return interstitialAdapter.isAnswered(stepDefinition, answers);
  }
}
