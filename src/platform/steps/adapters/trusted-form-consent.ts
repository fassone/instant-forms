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
    const answer = getTrustedFormSubmissionAnswer(input);

    if (!answer.accepted) {
      return { ok: false, message: stepDefinition.consent.validationMessage || errors.requiredAnswer };
    }

    if (answer.accepted !== stepDefinition.acceptedAnswer) {
      return { ok: false, message: stepDefinition.consent.validationMessage };
    }

    return {
      ok: true,
      answer: {
        consent: answer.consentText || stepDefinition.acceptedAnswer,
        trustedform_certificate_url: answer.trustedFormCertUrl ?? null,
      },
      includeInSubmission: true,
      visibilityAnswer: stepDefinition.acceptedAnswer,
    };
  },
  isAnswered(stepDefinition, answers) {
    return answers[stepDefinition.key] === stepDefinition.acceptedAnswer;
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function getTrustedFormSubmissionAnswer(input: unknown): {
  accepted: string;
  consentText?: string;
  trustedFormCertUrl?: string;
} {
  if (isRecord(input)) {
    const consent = getStringAnswer(input.consent);
    const accepted = getStringAnswer(input.accepted) || (consent === "accepted" ? consent : "");
    const trustedFormCertUrl = getStringAnswer(input.trustedform_certificate_url);
    const consentText = consent && consent !== accepted ? consent : "";

    return {
      accepted,
      ...(consentText ? { consentText } : {}),
      ...(trustedFormCertUrl ? { trustedFormCertUrl } : {}),
    };
  }

  return { accepted: getStringAnswer(input) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
