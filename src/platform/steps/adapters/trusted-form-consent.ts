import type { TrustedFormConsentStep } from "../../flow";
import type { StepAdapter } from "./index";

export const trustedFormConsentAdapter: StepAdapter<TrustedFormConsentStep> = {
  kind: "trusted_form_consent",
  validateCheckpoint(stepDefinition, input, errors) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: stepDefinition.consent.validationMessage || errors.requiredAnswer };
    }

    if (answer !== stepDefinition.acceptedAnswer) {
      return { ok: false, message: stepDefinition.consent.validationMessage };
    }

    return { ok: true, answer, includeInSubmission: false };
  },
  validateSubmission(stepDefinition, input, errors) {
    return trustedFormConsentAdapter.validateCheckpoint(stepDefinition, input, errors);
  },
  isAnswered(stepDefinition, answers) {
    return answers[stepDefinition.key] === stepDefinition.acceptedAnswer;
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
