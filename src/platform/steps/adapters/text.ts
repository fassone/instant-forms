import type { TextStep } from "../../flow";
import type { StepAdapter } from "./index";

export const textAdapter: StepAdapter<TextStep> = {
  kind: "text",
  validateCheckpoint(stepDefinition, input, errors) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: errors.requiredAnswer };
    }

    return { ok: true, answer, includeInSubmission: true };
  },
  validateSubmission(stepDefinition, input, errors) {
    return textAdapter.validateCheckpoint(stepDefinition, input, errors);
  },
  isAnswered(stepDefinition, answers) {
    return Boolean(answers[stepDefinition.key]);
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
