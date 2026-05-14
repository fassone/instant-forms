import type { ChoiceStep } from "../../flow";
import type { StepAdapter } from "./index";

const requiredMessage = "Esta respuesta es requerida.";

export const choiceAdapter: StepAdapter<ChoiceStep> = {
  kind: "choice",
  validateCheckpoint(stepDefinition, input) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: requiredMessage };
    }

    if (!stepDefinition.options.some((option) => option.key === answer)) {
      return { ok: false, message: "Answer is not a valid option." };
    }

    return { ok: true, answer, includeInSubmission: true };
  },
  validateSubmission(stepDefinition, input) {
    return choiceAdapter.validateCheckpoint(stepDefinition, input);
  },
  isAnswered(stepDefinition, answers) {
    return Boolean(answers[stepDefinition.key]);
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
