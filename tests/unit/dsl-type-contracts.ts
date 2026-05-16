import { defineFormFlow, resolve, step, z } from "../../src/platform/flow";

const contract = {
  context: z.object({}),
  answers: z.object({
    belongs_to_state: z.enum(["yes", "no"]),
    first_name: z.string(),
  }),
  payload: z.object({ firstName: z.string() }),
};

const payload = {
  method: "POST",
  encoding: "json",
  mapping: ({ answers }: { answers: { first_name: string } }) => ({
    firstName: answers.first_name,
  }),
} as const;

void defineFormFlow({
  name: "Valid Type Fixture",
  status: "ACTIVE",
  contract,
  context: {},
  payload,
  page: { name: "Page" },
  steps: [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      autocomplete: "given-name",
      showWhen: {
        questionKey: "belongs_to_state",
        answer: "yes",
      },
    }),
  ],
});

void defineFormFlow({
  name: "Valid Resolver Fixture",
  status: "ACTIVE",
  contract,
  context: {},
  payload,
  page: { name: "Page" },
  steps: [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      autocomplete: "given-name",
    }),
    step.trustedFormConsent({
      key: "trustedform_consent",
      slug: "consentimiento",
      label: "Consentimiento",
      disclosure: "Consentimiento.",
      grantorSummary: resolve(["first_name"], ({ answers }) => ({
        name: answers.first_name,
      })),
    }),
  ],
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  label: "Consentimiento",
  disclosure: "Consentimiento.",
  grantorSummary: resolve(["first_name"], ({ answers }) => ({
    name: answers.first_name,
    // @ts-expect-error Resolver answers are limited to declared dependency keys.
    phone: answers.phone_number,
  })),
});

const orderingContract = {
  context: z.object({}),
  answers: z.object({
    belongs_to_state: z.enum(["yes", "no"]),
    residence_state: z.string().optional(),
    has_license: z.enum(["yes", "no"]),
  }),
  payload: z.object({ hasLicense: z.string() }),
};

const orderingPayload = {
  method: "POST",
  encoding: "json",
  mapping: ({ answers }: { answers: { has_license: string } }) => ({
    hasLicense: answers.has_license,
  }),
} as const;

// @ts-expect-error showWhen can only depend on answer-producing steps that appear earlier in the flow.
void defineFormFlow({
  name: "Invalid Forward Condition",
  status: "ACTIVE",
  contract: orderingContract,
  context: {},
  payload: orderingPayload,
  page: { name: "Page" },
  steps: [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.autocomplete({
      key: "residence_state",
      slug: "estado",
      label: "Estado",
      autocomplete: "address-level1",
      source: {
        key: "us_states",
        clientKey: "usStates",
        normalize: (value: string) => value,
        validationMessage: "Estado requerido.",
      },
      showWhen: {
        questionKey: "has_license",
        answer: "no",
      },
    }),
    step.choice({
      key: "has_license",
      slug: "licencia",
      label: "Tiene licencia?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
  ],
});

// @ts-expect-error Dynamic resolver dependencies can only depend on earlier answer-producing steps.
void defineFormFlow({
  name: "Invalid Forward Resolver",
  status: "ACTIVE",
  contract: orderingContract,
  context: {},
  payload: orderingPayload,
  page: { name: "Page" },
  steps: [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.interstitial({
      key: "matching_offer",
      slug: "buscando",
      label: "Buscando",
      successLines: [{ text: "Listo", color: "accent" }],
      benefits: resolve(["has_license"], ({ answers }) => [answers.has_license]),
    }),
    step.autocomplete({
      key: "residence_state",
      slug: "estado",
      label: "Estado",
      autocomplete: "address-level1",
      source: {
        key: "us_states",
        clientKey: "usStates",
        normalize: (value: string) => value,
        validationMessage: "Estado requerido.",
      },
    }),
    step.choice({
      key: "has_license",
      slug: "licencia",
      label: "Tiene licencia?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
  ],
});

// @ts-expect-error Choice option keys must match the answer enum declared in contract.answers.
void defineFormFlow({
  name: "Invalid Choice Options",
  status: "ACTIVE",
  contract,
  context: {},
  payload,
  page: { name: "Page" },
  steps: [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yeas", label: "Si" },
        { key: "nao", label: "No" },
      ],
    }),
    step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      autocomplete: "given-name",
    }),
  ],
});

// @ts-expect-error showWhen.questionKey must reference a key declared in contract.answers.
void defineFormFlow({
  name: "Invalid Condition Key",
  status: "ACTIVE",
  contract,
  context: {},
  payload,
  page: { name: "Page" },
  steps: [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      autocomplete: "given-name",
      showWhen: {
        questionKey: "belonegs_to_state",
        answer: "no",
      },
    }),
  ],
});

// @ts-expect-error showWhen.answer must match the referenced answer enum.
void defineFormFlow({
  name: "Invalid Condition Answer",
  status: "ACTIVE",
  contract,
  context: {},
  payload,
  page: { name: "Page" },
  steps: [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      autocomplete: "given-name",
      showWhen: {
        questionKey: "belongs_to_state",
        answer: "nreo",
      },
    }),
  ],
});
