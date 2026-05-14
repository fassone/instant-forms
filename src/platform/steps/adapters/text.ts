import type { TextStep } from "../../flow";
import type { StepAdapter } from "./index";

const requiredMessage = "Esta respuesta es requerida.";

export const textAdapter: StepAdapter<TextStep> = {
  kind: "text",
  validateCheckpoint(stepDefinition, input) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: requiredMessage };
    }

    return { ok: true, answer, includeInSubmission: true };
  },
  validateSubmission(stepDefinition, input) {
    return textAdapter.validateCheckpoint(stepDefinition, input);
  },
  isAnswered(stepDefinition, answers) {
    return Boolean(answers[stepDefinition.key]);
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
