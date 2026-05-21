import type { TrustedFormConsentStep } from "../../flow";
import type { StepAdapter } from "./index";

const requiredMessage = "Esta respuesta es requerida.";

export const trustedFormConsentAdapter: StepAdapter<TrustedFormConsentStep> = {
  kind: "trusted_form_consent",
  validateCheckpoint(stepDefinition, input) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: requiredMessage };
    }

    if (answer !== stepDefinition.acceptedAnswer) {
      return { ok: false, message: stepDefinition.consent.validationMessage };
    }

    return { ok: true, answer, includeInSubmission: false };
  },
  validateSubmission(stepDefinition, input) {
    return trustedFormConsentAdapter.validateCheckpoint(stepDefinition, input);
  },
  isAnswered(stepDefinition, answers) {
    return answers[stepDefinition.key] === stepDefinition.acceptedAnswer;
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
