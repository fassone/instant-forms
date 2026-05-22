import type { AutocompleteStep } from "../../flow";
import type { StepAdapter } from "./index";

export const autocompleteAdapter: StepAdapter<AutocompleteStep> = {
  kind: "autocomplete",
  validateCheckpoint(stepDefinition, input, errors) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: errors.requiredAnswer };
    }

    const normalizedAnswer = stepDefinition.normalize(answer);

    if (!normalizedAnswer) {
      return { ok: false, message: stepDefinition.validationMessage || errors.invalidAutocomplete };
    }

    return { ok: true, answer: normalizedAnswer, includeInSubmission: true };
  },
  validateSubmission(stepDefinition, input, errors) {
    return autocompleteAdapter.validateCheckpoint(stepDefinition, input, errors);
  },
  isAnswered(stepDefinition, answers) {
    return Boolean(answers[stepDefinition.key]);
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
