import { US_STATE_VALIDATION_MESSAGE, normalizeUsState } from "./us-states";

export type FormStatus = "ACTIVE" | "INACTIVE";

export type SourceStepType = "CUSTOM" | "FIRST_NAME" | "LAST_NAME" | "PHONE" | "AUTOCOMPLETE" | "INTERSTITIAL";

export type StepCondition = {
  questionKey: string;
  answer: string;
};

export type FormOption = {
  key: string;
  value: string;
};

export type StepTemplateKey = "choice" | "text" | "phone" | "autocomplete" | "interstitial";

export type CheckpointMode = "answer" | "checkpoint_only";

export type StepBehavior = {
  autoAdvance?: boolean;
  mobileBlurSubmit?: boolean;
  mask?: "us_phone";
  suggestions?: "autocomplete";
  interstitialTiming?: "matching_offer";
};

type BaseStep = {
  key: string;
  slug: string;
  label: string;
  id: string;
  template: StepTemplateKey;
  checkpointMode: CheckpointMode;
  behavior: StepBehavior;
  countsAsStep?: boolean;
  showWhen?: StepCondition;
};

export type ChoiceStep = BaseStep & {
  kind: "choice";
  type: "CUSTOM";
  options: readonly FormOption[];
};

export type TextStep = BaseStep & {
  kind: "text";
  type: "FIRST_NAME" | "LAST_NAME";
  autocomplete: string;
  inputMode: "text";
};

export type PhoneStep = BaseStep & {
  kind: "phone";
  type: "PHONE";
  autocomplete: "tel";
  inputMode: "tel";
};

export type AutocompleteSourceKey = "us_states";

export type AutocompleteSourceDefinition = {
  key: AutocompleteSourceKey;
  clientKey: "usStates";
  normalize: (value: string) => string | undefined;
  validationMessage: string;
};

export type AutocompleteStep = BaseStep & {
  kind: "autocomplete";
  type: "AUTOCOMPLETE";
  autocomplete: string;
  inputMode: "text";
  source: AutocompleteSourceDefinition;
  validationMessage: string;
  normalize: (value: string) => string | undefined;
};

export type SuccessLineColor = "brand-navy" | "accent";

export type InterstitialSuccessLine = {
  text: string;
  color: SuccessLineColor;
};

export type InterstitialStep = BaseStep & {
  kind: "interstitial";
  type: "INTERSTITIAL";
  loadingLabel: string;
  successLines: readonly InterstitialSuccessLine[];
  completionAnswer: "completed";
  seenAnswer: "seen";
  benefits: readonly string[];
};

export type FormStep = ChoiceStep | TextStep | PhoneStep | AutocompleteStep | InterstitialStep;

export type InstantForm = {
  id: string;
  name: string;
  status: FormStatus;
  areaCode: string;
  page: {
    id: string;
    name: string;
  };
  steps: readonly FormStep[];
};

type BaseStepInput = {
  key: string;
  slug: string;
  label: string;
  id?: string;
  countsAsStep?: boolean;
  showWhen?: StepCondition;
};

type ChoiceStepInput = BaseStepInput & {
  options: readonly { key: string; label: string }[];
};

type TextStepInput = BaseStepInput & {
  type?: TextStep["type"];
  autocomplete: string;
};

type PhoneStepInput = BaseStepInput;

type AutocompleteStepInput = BaseStepInput & {
  source: AutocompleteSourceDefinition;
  autocomplete: string;
  inputMode?: "text";
  normalize?: (value: string) => string | undefined;
  validationMessage?: string;
};

type InterstitialStepInput = BaseStepInput & {
  loadingLabel?: string;
  successLines: readonly InterstitialSuccessLine[];
  completionAnswer?: "completed";
  seenAnswer?: "seen";
  benefits: readonly string[];
};

type FormFlowInput = {
  id: string;
  name: string;
  status: FormStatus;
  areaCode: string;
  page: {
    id: string;
    name: string;
  };
  steps: readonly FormStep[];
};

export const autocompleteSource = {
  usStates(): AutocompleteSourceDefinition {
    return {
      key: "us_states",
      clientKey: "usStates",
      normalize: normalizeUsState,
      validationMessage: US_STATE_VALIDATION_MESSAGE,
    };
  },
} as const;

export const step = {
  choice(input: ChoiceStepInput): ChoiceStep {
    return {
      ...baseStep(input, "choice", "answer", { autoAdvance: true }),
      kind: "choice",
      type: "CUSTOM",
      options: input.options.map((option) => ({ key: option.key, value: option.label })),
    };
  },

  text(input: TextStepInput): TextStep {
    return {
      ...baseStep(input, "text", "answer", { mobileBlurSubmit: true }),
      kind: "text",
      type: input.type ?? "FIRST_NAME",
      autocomplete: input.autocomplete,
      inputMode: "text",
    };
  },

  phone(input: PhoneStepInput): PhoneStep {
    return {
      ...baseStep(input, "phone", "answer", { mask: "us_phone", mobileBlurSubmit: true }),
      kind: "phone",
      type: "PHONE",
      autocomplete: "tel",
      inputMode: "tel",
    };
  },

  autocomplete(input: AutocompleteStepInput): AutocompleteStep {
    return {
      ...baseStep(input, "autocomplete", "answer", { suggestions: "autocomplete" }),
      kind: "autocomplete",
      type: "AUTOCOMPLETE",
      autocomplete: input.autocomplete,
      inputMode: input.inputMode ?? "text",
      source: input.source,
      validationMessage: input.validationMessage ?? input.source.validationMessage,
      normalize: input.normalize ?? input.source.normalize,
    };
  },

  interstitial(input: InterstitialStepInput): InterstitialStep {
    return {
      ...baseStep(input, "interstitial", "checkpoint_only", { interstitialTiming: "matching_offer" }),
      kind: "interstitial",
      type: "INTERSTITIAL",
      loadingLabel: input.loadingLabel ?? "",
      successLines: input.successLines,
      completionAnswer: input.completionAnswer ?? "completed",
      seenAnswer: input.seenAnswer ?? "seen",
      benefits: input.benefits,
    };
  },
} as const;

export function defineFormFlow(input: FormFlowInput): InstantForm {
  return {
    ...input,
    areaCode: input.areaCode.trim().toLowerCase(),
  };
}

export const formsByArea = {
  tn: defineFormFlow({
    id: "1011189481863371",
    name: "ES - TN - v6",
    status: "ACTIVE",
    areaCode: "tn",
    page: {
      id: "298730479987891",
      name: "Seguros Aseguranza",
    },
    steps: [
      step.choice({
        key: "belongs_to_state",
        slug: "vive-en-tennessee",
        label: "¿Usted vive en Tennessee?",
        id: "1653615922583282",
        options: [
          { key: "yes", label: "Si" },
          { key: "no", label: "No" },
        ],
      }),
      step.autocomplete({
        key: "residence_state",
        slug: "estado-donde-vive",
        label: "¿En qué estado vive?",
        id: "residence_state",
        autocomplete: "address-level1",
        source: autocompleteSource.usStates(),
        showWhen: {
          questionKey: "belongs_to_state",
          answer: "no",
        },
      }),
      step.choice({
        key: "has_license",
        slug: "tiene-licencia",
        label: "¿Usted tiene licencia de los Estado Unidos?",
        id: "782123394910922",
        options: [
          { key: "yes", label: "Si" },
          { key: "no", label: "No" },
        ],
      }),
      step.choice({
        key: "has_insurance",
        slug: "tiene-seguro",
        label: "¿Usted tiene seguro de los Estado Unidos?",
        id: "2197559684116183",
        options: [
          { key: "yes", label: "Si" },
          { key: "no", label: "No" },
        ],
      }),
      step.choice({
        key: "is_clean_title",
        slug: "titulo-limpio",
        label: "¿Su auto tiene título limpio?",
        id: "1044815071204693",
        options: [
          { key: "yes", label: "Si" },
          { key: "no", label: "No" },
        ],
      }),
      step.choice({
        key: "number_of_registered_cars",
        slug: "autos-a-asegurar",
        label: "¿Cuantos autos quiere asegurar?",
        id: "1000790812295278",
        options: [
          { key: "1", label: "1" },
          { key: "2+", label: "2+" },
        ],
      }),
      step.interstitial({
        key: "matching_offer",
        slug: "buscando-oferta",
        label: "Estamos buscando su seguro ideal",
        id: "matching_offer",
        countsAsStep: false,
        benefits: [
          "Revisando sus respuestas",
          "Buscando agentes disponibles",
          "Priorizando atención en español",
          "Preparando opciones en {{areaName}}",
        ],
        successLines: [
          { text: "Encontramos agentes listos para cotizarle.", color: "brand-navy" },
          { text: "Descubra cuánto puede ahorrar.", color: "accent" },
        ],
      }),
      step.text({
        key: "first_name",
        slug: "nombre",
        label: "Nombre",
        id: "1283697083392173",
        type: "FIRST_NAME",
        autocomplete: "given-name",
      }),
      step.text({
        key: "last_name",
        slug: "apellido",
        label: "Apellido",
        id: "1529546892176037",
        type: "LAST_NAME",
        autocomplete: "family-name",
      }),
      step.phone({
        key: "phone_number",
        slug: "telefono",
        label: "Número de teléfono",
        id: "1594967471565670",
      }),
    ],
  }),
} as const satisfies Record<string, InstantForm>;

export type AreaCode = keyof typeof formsByArea;

export function getFormByAreaCode(areaCode: string): InstantForm | undefined {
  const normalizedAreaCode = areaCode.trim().toLowerCase();

  return (formsByArea as Record<string, InstantForm>)[normalizedAreaCode];
}

export function getStepSlug(stepDefinition: FormStep): string {
  return stepDefinition.slug;
}

export function getLegacyStepSlug(stepDefinition: FormStep): string {
  return stepDefinition.key.replaceAll("_", "-");
}

export function getStepUrl(form: InstantForm, stepDefinition: FormStep): string {
  return `/${form.areaCode}/${getStepSlug(stepDefinition)}`;
}

export function isStepVisible(stepDefinition: FormStep, answers: Record<string, string>): boolean {
  if (stepDefinition.kind === "interstitial" && answers[stepDefinition.key] === stepDefinition.seenAnswer) {
    return false;
  }

  if (!stepDefinition.showWhen) {
    return true;
  }

  return answers[stepDefinition.showWhen.questionKey] === stepDefinition.showWhen.answer;
}

export function getVisibleSteps(form: InstantForm, answers: Record<string, string>): readonly FormStep[] {
  return form.steps.filter((stepDefinition) => isStepVisible(stepDefinition, answers));
}

export function isCountedStep(stepDefinition: FormStep): boolean {
  return stepDefinition.countsAsStep ?? stepDefinition.kind !== "interstitial";
}

export function getStepIndexBySlug(form: InstantForm, slug: string): number {
  return form.steps.findIndex((stepDefinition) => getStepSlug(stepDefinition) === slug);
}

export function getStepIndexByLegacySlug(form: InstantForm, slug: string): number {
  return form.steps.findIndex((stepDefinition) => getLegacyStepSlug(stepDefinition) === slug);
}

export function getStepByKey(form: InstantForm, key: string): FormStep | undefined {
  return form.steps.find((stepDefinition) => stepDefinition.key === key);
}

function baseStep(
  input: BaseStepInput,
  template: StepTemplateKey,
  checkpointMode: CheckpointMode,
  behavior: StepBehavior,
): BaseStep {
  return {
    key: input.key,
    slug: input.slug,
    label: input.label,
    id: input.id ?? input.key,
    template,
    checkpointMode,
    behavior,
    countsAsStep: input.countsAsStep,
    showWhen: input.showWhen,
  };
}
