import type { InterstitialStep } from "../../flow";
import type { StepAdapter } from "./index";

export const interstitialAdapter: StepAdapter<InterstitialStep> = {
  kind: "interstitial",
  validateCheckpoint(stepDefinition, input, errors) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: errors.requiredAnswer };
    }

    if (answer !== stepDefinition.completionAnswer && answer !== stepDefinition.seenAnswer) {
      return { ok: false, message: errors.incompleteStep };
    }

    return { ok: true, answer, includeInSubmission: false };
  },
  validateSubmission() {
    return { ok: true, answer: "", includeInSubmission: false };
  },
  isAnswered(stepDefinition, answers) {
    return answers[stepDefinition.key] === stepDefinition.seenAnswer;
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
