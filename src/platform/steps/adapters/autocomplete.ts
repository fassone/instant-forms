import type { AutocompleteStep } from "../../flow";
import type { StepAdapter } from "./index";

const requiredMessage = "Esta respuesta es requerida.";

export const autocompleteAdapter: StepAdapter<AutocompleteStep> = {
  kind: "autocomplete",
  validateCheckpoint(stepDefinition, input) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: requiredMessage };
    }

    const normalizedAnswer = stepDefinition.normalize(answer);

    if (!normalizedAnswer) {
      return { ok: false, message: stepDefinition.validationMessage };
    }

    return { ok: true, answer: normalizedAnswer, includeInSubmission: true };
  },
  validateSubmission(stepDefinition, input) {
    return autocompleteAdapter.validateCheckpoint(stepDefinition, input);
  },
  isAnswered(stepDefinition, answers) {
    return Boolean(answers[stepDefinition.key]);
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
