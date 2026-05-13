export type FormStatus = "ACTIVE" | "INACTIVE";

export type SourceQuestionType = "CUSTOM" | "FIRST_NAME" | "LAST_NAME" | "PHONE";

export type FormOption = {
  key: string;
  value: string;
};

export type ChoiceQuestion = {
  kind: "choice";
  key: string;
  label: string;
  type: "CUSTOM";
  id: string;
  options: readonly FormOption[];
};

export type TextQuestion = {
  kind: "text";
  key: string;
  label: string;
  type: Exclude<SourceQuestionType, "CUSTOM">;
  id: string;
  autocomplete: string;
  inputMode: "text" | "tel";
};

export type FormQuestion = ChoiceQuestion | TextQuestion;

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
        label: "¿Usted vive en Tennessee?",
        options: [
          { key: "yes", value: "Si" },
          { key: "no", value: "No" },
        ],
        type: "CUSTOM",
        id: "1653615922583282",
      },
      {
        kind: "choice",
        key: "has_license",
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
        label: "Nombre",
        type: "FIRST_NAME",
        id: "1283697083392173",
        autocomplete: "given-name",
        inputMode: "text",
      },
      {
        kind: "text",
        key: "last_name",
        label: "Apellido",
        type: "LAST_NAME",
        id: "1529546892176037",
        autocomplete: "family-name",
        inputMode: "text",
      },
      {
        kind: "text",
        key: "phone_number",
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
