import { autocompleteAdapter } from "./autocomplete";
import { choiceAdapter } from "./choice";
import { interstitialAdapter } from "./interstitial";
import { phoneAdapter } from "./phone";
import { textAdapter } from "./text";
import { trustedFormConsentAdapter } from "./trusted-form-consent";
import type { FormStep, FormUiErrorCopy } from "../../flow";

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
  validateCheckpoint: (stepDefinition: TStep, input: unknown, errors: FormUiErrorCopy) => StepValidationResult;
  validateSubmission: (stepDefinition: TStep, input: unknown, errors: FormUiErrorCopy) => StepValidationResult;
  isAnswered: (stepDefinition: TStep, answers: Record<string, string>) => boolean;
};

export function validateStepCheckpointAnswer(
  stepDefinition: FormStep,
  input: unknown,
  errors: FormUiErrorCopy,
): StepValidationResult {
  switch (stepDefinition.kind) {
    case "choice":
      return choiceAdapter.validateCheckpoint(stepDefinition, input, errors);
    case "text":
      return textAdapter.validateCheckpoint(stepDefinition, input, errors);
    case "phone":
      return phoneAdapter.validateCheckpoint(stepDefinition, input, errors);
    case "autocomplete":
      return autocompleteAdapter.validateCheckpoint(stepDefinition, input, errors);
    case "interstitial":
      return interstitialAdapter.validateCheckpoint(stepDefinition, input, errors);
    case "trusted_form_consent":
      return trustedFormConsentAdapter.validateCheckpoint(stepDefinition, input, errors);
  }
}

export function validateStepSubmissionAnswer(
  stepDefinition: FormStep,
  input: unknown,
  errors: FormUiErrorCopy,
): StepValidationResult {
  switch (stepDefinition.kind) {
    case "choice":
      return choiceAdapter.validateSubmission(stepDefinition, input, errors);
    case "text":
      return textAdapter.validateSubmission(stepDefinition, input, errors);
    case "phone":
      return phoneAdapter.validateSubmission(stepDefinition, input, errors);
    case "autocomplete":
      return autocompleteAdapter.validateSubmission(stepDefinition, input, errors);
    case "interstitial":
      return interstitialAdapter.validateSubmission(stepDefinition, input, errors);
    case "trusted_form_consent":
      return trustedFormConsentAdapter.validateSubmission(stepDefinition, input, errors);
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
    case "trusted_form_consent":
      return trustedFormConsentAdapter.isAnswered(stepDefinition, answers);
  }
}
