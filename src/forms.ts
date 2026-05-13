export type FormStatus = "ACTIVE" | "INACTIVE";

export type SourceQuestionType = "CUSTOM" | "FIRST_NAME" | "LAST_NAME" | "PHONE" | "STATE";

export type QuestionCondition = {
  questionKey: string;
  answer: string;
};

export type FormOption = {
  key: string;
  value: string;
};

type BaseQuestion = {
  key: string;
  slug: string;
  label: string;
  id: string;
  showWhen?: QuestionCondition;
};

export type ChoiceQuestion = BaseQuestion & {
  kind: "choice";
  type: "CUSTOM";
  options: readonly FormOption[];
};

export type TextQuestion = BaseQuestion & {
  kind: "text";
  type: Exclude<SourceQuestionType, "CUSTOM" | "STATE">;
  autocomplete: string;
  inputMode: "text" | "tel";
};

export type StateQuestion = BaseQuestion & {
  kind: "state";
  type: "STATE";
  autocomplete: string;
  inputMode: "text";
};

export type FormQuestion = ChoiceQuestion | TextQuestion | StateQuestion;

export type InstantForm = {
  id: string;
  name: string;
  status: FormStatus;
  stateCode: string;
  page: {
    id: string;
    name: string;
  };
  questions: readonly FormQuestion[];
};

export const formsByState = {
  tn: {
    id: "1011189481863371",
    name: "ES - TN - v6",
    status: "ACTIVE",
    stateCode: "tn",
    page: {
      id: "298730479987891",
      name: "Seguros Aseguranza",
    },
    questions: [
      {
        kind: "choice",
        key: "belongs_to_state",
        slug: "vive-en-tennessee",
        label: "¿Usted vive en Tennessee?",
        options: [
          { key: "yes", value: "Si" },
          { key: "no", value: "No" },
        ],
        type: "CUSTOM",
        id: "1653615922583282",
      },
      {
        kind: "state",
        key: "residence_state",
        slug: "estado-donde-vive",
        label: "¿En qué estado vive?",
        type: "STATE",
        id: "residence_state",
        autocomplete: "address-level1",
        inputMode: "text",
        showWhen: {
          questionKey: "belongs_to_state",
          answer: "no",
        },
      },
      {
        kind: "choice",
        key: "has_license",
        slug: "tiene-licencia",
        label: "¿Usted tiene licencia de los Estado Unidos?",
        options: [
          { key: "yes", value: "Si" },
          { key: "no", value: "No" },
        ],
        type: "CUSTOM",
        id: "782123394910922",
      },
      {
        kind: "choice",
        key: "has_insurance",
        slug: "tiene-seguro",
        label: "¿Usted tiene seguro de los Estado Unidos?",
        options: [
          { key: "yes", value: "Si" },
          { key: "no", value: "No" },
        ],
        type: "CUSTOM",
        id: "2197559684116183",
      },
      {
        kind: "choice",
        key: "is_clean_title",
        slug: "titulo-limpio",
        label: "¿Su auto tiene título limpio?",
        options: [
          { key: "yes", value: "Si" },
          { key: "no", value: "No" },
        ],
        type: "CUSTOM",
        id: "1044815071204693",
      },
      {
        kind: "choice",
        key: "number_of_registered_cars",
        slug: "autos-a-asegurar",
        label: "¿Cuantos autos quiere asegurar?",
        options: [
          { key: "1", value: "1" },
          { key: "2+", value: "2+" },
        ],
        type: "CUSTOM",
        id: "1000790812295278",
      },
      {
        kind: "text",
        key: "first_name",
        slug: "nombre",
        label: "Nombre",
        type: "FIRST_NAME",
        id: "1283697083392173",
        autocomplete: "given-name",
        inputMode: "text",
      },
      {
        kind: "text",
        key: "last_name",
        slug: "apellido",
        label: "Apellido",
        type: "LAST_NAME",
        id: "1529546892176037",
        autocomplete: "family-name",
        inputMode: "text",
      },
      {
        kind: "text",
        key: "phone_number",
        slug: "telefono",
        label: "Número de teléfono",
        type: "PHONE",
        id: "1594967471565670",
        autocomplete: "tel",
        inputMode: "tel",
      },
    ],
  },
} as const satisfies Record<string, InstantForm>;

export type StateCode = keyof typeof formsByState;

export function getFormByStateCode(stateCode: string): InstantForm | undefined {
  const normalizedStateCode = stateCode.trim().toLowerCase();

  return (formsByState as Record<string, InstantForm>)[normalizedStateCode];
}

export function getQuestionSlug(question: FormQuestion): string {
  return question.slug;
}

export function getLegacyQuestionSlug(question: FormQuestion): string {
  return question.key.replaceAll("_", "-");
}

export function getStepUrl(form: InstantForm, question: FormQuestion): string {
  return `/${form.stateCode}/${getQuestionSlug(question)}`;
}

export function isQuestionVisible(question: FormQuestion, answers: Record<string, string>): boolean {
  if (!question.showWhen) {
    return true;
  }

  return answers[question.showWhen.questionKey] === question.showWhen.answer;
}

export function getVisibleQuestions(form: InstantForm, answers: Record<string, string>): readonly FormQuestion[] {
  return form.questions.filter((question) => isQuestionVisible(question, answers));
}

export function getQuestionIndexBySlug(form: InstantForm, slug: string): number {
  return form.questions.findIndex((question) => getQuestionSlug(question) === slug);
}

export function getQuestionIndexByLegacySlug(form: InstantForm, slug: string): number {
  return form.questions.findIndex((question) => getLegacyQuestionSlug(question) === slug);
}

export function getQuestionByKey(form: InstantForm, key: string): FormQuestion | undefined {
  return form.questions.find((question) => question.key === key);
}
