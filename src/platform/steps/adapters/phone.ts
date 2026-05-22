import type { PhoneStep } from "../../flow";
import { normalizeUsPhoneNumber } from "../phone/us-phone";
import type { StepAdapter } from "./index";

export const phoneAdapter: StepAdapter<PhoneStep> = {
  kind: "phone",
  validateCheckpoint(stepDefinition, input, errors) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: errors.requiredAnswer };
    }

    if (!normalizeUsPhoneNumber(answer)) {
      return { ok: false, message: errors.invalidPhone };
    }

    return { ok: true, answer, includeInSubmission: true };
  },
  validateSubmission(stepDefinition, input, errors) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: errors.requiredAnswer };
    }

    const normalizedPhone = normalizeUsPhoneNumber(answer);

    if (!normalizedPhone) {
      return { ok: false, message: errors.invalidPhone };
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
