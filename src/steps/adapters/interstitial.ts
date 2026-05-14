import type { InterstitialStep } from "../../flows";
import type { StepAdapter } from "./index";

const requiredMessage = "Esta respuesta es requerida.";

export const interstitialAdapter: StepAdapter<InterstitialStep> = {
  kind: "interstitial",
  validateCheckpoint(stepDefinition, input) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: requiredMessage };
    }

    if (answer !== stepDefinition.completionAnswer && answer !== stepDefinition.seenAnswer) {
      return { ok: false, message: "No pudimos completar este paso." };
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
