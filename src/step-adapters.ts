import type {
  AutocompleteStep,
  ChoiceStep,
  FormStep,
  InterstitialStep,
  PhoneStep,
  TextStep,
} from "./forms";
import { US_PHONE_VALIDATION_MESSAGE, normalizeUsPhoneNumber } from "./phone";

export type StepValidationResult =
  | {
      ok: true;
      answer: string;
      includeInSubmission: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type StepAdapter<TStep extends FormStep> = {
  kind: TStep["kind"];
  validateCheckpoint: (stepDefinition: TStep, input: unknown) => StepValidationResult;
  validateSubmission: (stepDefinition: TStep, input: unknown) => StepValidationResult;
  isAnswered: (stepDefinition: TStep, answers: Record<string, string>) => boolean;
};

const requiredMessage = "Esta respuesta es requerida.";

const choiceAdapter: StepAdapter<ChoiceStep> = {
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

const textAdapter: StepAdapter<TextStep> = {
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

const phoneAdapter: StepAdapter<PhoneStep> = {
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

const autocompleteAdapter: StepAdapter<AutocompleteStep> = {
  kind: "autocomplete",
  validateCheckpoint(stepDefinition, input) {
    const answer = getStringAnswer(input);

    if (!answer) {
      return { ok: false, message: requiredMessage };
    }

    const normalizedAnswer = stepDefinition.normalize(answer);

    if (!normalizedAnswer) {
      return { ok: false, message: stepDefinition.validationMessage };
    }

    return { ok: true, answer: normalizedAnswer, includeInSubmission: true };
  },
  validateSubmission(stepDefinition, input) {
    return autocompleteAdapter.validateCheckpoint(stepDefinition, input);
  },
  isAnswered(stepDefinition, answers) {
    return Boolean(answers[stepDefinition.key]);
  },
};

const interstitialAdapter: StepAdapter<InterstitialStep> = {
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

export function validateStepCheckpointAnswer(stepDefinition: FormStep, input: unknown): StepValidationResult {
  switch (stepDefinition.kind) {
    case "choice":
      return choiceAdapter.validateCheckpoint(stepDefinition, input);
    case "text":
      return textAdapter.validateCheckpoint(stepDefinition, input);
    case "phone":
      return phoneAdapter.validateCheckpoint(stepDefinition, input);
    case "autocomplete":
      return autocompleteAdapter.validateCheckpoint(stepDefinition, input);
    case "interstitial":
      return interstitialAdapter.validateCheckpoint(stepDefinition, input);
  }
}

export function validateStepSubmissionAnswer(stepDefinition: FormStep, input: unknown): StepValidationResult {
  switch (stepDefinition.kind) {
    case "choice":
      return choiceAdapter.validateSubmission(stepDefinition, input);
    case "text":
      return textAdapter.validateSubmission(stepDefinition, input);
    case "phone":
      return phoneAdapter.validateSubmission(stepDefinition, input);
    case "autocomplete":
      return autocompleteAdapter.validateSubmission(stepDefinition, input);
    case "interstitial":
      return interstitialAdapter.validateSubmission(stepDefinition, input);
  }
}

export function isStepAnswered(stepDefinition: FormStep, answers: Record<string, string>): boolean {
  switch (stepDefinition.kind) {
    case "choice":
      return choiceAdapter.isAnswered(stepDefinition, answers);
    case "text":
      return textAdapter.isAnswered(stepDefinition, answers);
    case "phone":
      return phoneAdapter.isAnswered(stepDefinition, answers);
    case "autocomplete":
      return autocompleteAdapter.isAnswered(stepDefinition, answers);
    case "interstitial":
      return interstitialAdapter.isAnswered(stepDefinition, answers);
  }
}

function getStringAnswer(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
