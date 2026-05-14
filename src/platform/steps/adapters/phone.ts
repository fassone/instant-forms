import type { PhoneStep } from "../../flow";
import { US_PHONE_VALIDATION_MESSAGE, normalizeUsPhoneNumber } from "../phone/us-phone";
import type { StepAdapter } from "./index";

const requiredMessage = "Esta respuesta es requerida.";

export const phoneAdapter: StepAdapter<PhoneStep> = {
  kind: "phone",
  validateCheckpoint(stepDefinition, input) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: requiredMessage };
    }

    if (!normalizeUsPhoneNumber(answer)) {
      return { ok: false, message: US_PHONE_VALIDATION_MESSAGE };
    }

    return { ok: true, answer, includeInSubmission: true };
  },
  validateSubmission(stepDefinition, input) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: requiredMessage };
    }

    const normalizedPhone = normalizeUsPhoneNumber(answer);

    if (!normalizedPhone) {
      return { ok: false, message: US_PHONE_VALIDATION_MESSAGE };
    }

    return { ok: true, answer: normalizedPhone, includeInSubmission: true };
  },
  isAnswered(stepDefinition, answers) {
    return Boolean(answers[stepDefinition.key]);
  },
};

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
