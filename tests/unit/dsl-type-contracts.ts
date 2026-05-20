import { defineFormFlow, resolve, step, text, z, type TrustedFormConsentStepInput } from "../../src/platform/flow";

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
      confirmation: {
        fields: resolve(["first_name"], ({ answers }) => [
          {
            name: "trusted_form_grantor_name",
            label: "Nombre",
            value: text(answers.first_name),
            trustedForm: {
              role: "consent-grantor-name",
            },
          },
        ]),
      },
    }),
  ],
});

declare const maybeName: string | undefined;

// @ts-expect-error text(...) rejects undefined parts.
void text("Hello ", undefined);

// @ts-expect-error text(...) requires optional values to be handled before concatenation.
void text("Hello ", maybeName);

void text("Hello ", maybeName ?? "Michel");

void step.interstitial({
  key: "matching_offer",
  slug: "buscando",
  label: "Buscando",
  successLines: [{ text: "Listo", color: "accent" }],
  // @ts-expect-error Resolver-backed text values must be created with text(...).
  benefits: resolve([], () => ["plain string"]),
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  label: "Consentimiento",
  disclosure: "Consentimiento.",
  confirmation: {
    // @ts-expect-error Resolver-backed confirmation values must be created with text(...).
    fields: resolve([], () => [
      {
        name: "review_name",
        label: "Nombre",
        value: "plain string",
      },
    ]),
  },
});

const optionalContextContract = {
  context: z.object({
    areaCode: z.string(),
    areaName: z.string().optional(),
  }),
  answers: z.object({
    belongs_to_state: z.enum(["yes", "no"]),
  }),
  payload: z.object({ areaCode: z.string() }),
};

void defineFormFlow({
  name: "Optional Context Resolver Fixture",
  status: "ACTIVE",
  contract: optionalContextContract,
  context: { areaCode: "TN" },
  payload: {
    method: "POST",
    encoding: "json",
    mapping: ({ context }) => ({ areaCode: context.areaCode }),
  },
  page: { name: "Page" },
  steps: ({ step, resolve, text }) => [
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
      benefits: resolve([], ({ context }) => [
        // @ts-expect-error Optional context requires a fallback before text(...).
        text("Area ", context.areaName),
        text("Area ", context.areaName ?? context.areaCode),
      ]),
    }),
  ],
});

const optionalAnswerContract = {
  context: z.object({}),
  answers: z.object({
    first_name: z.string(),
    last_name: z.string(),
    phone_number: z.string(),
    residence_state: z.string().optional(),
  }),
  payload: z.object({ phone: z.string() }),
};

void defineFormFlow({
  name: "Optional Answer Resolver Fixture",
  status: "ACTIVE",
  contract: optionalAnswerContract,
  context: {},
  payload: {
    method: "POST",
    encoding: "json",
    mapping: ({ answers }) => ({ phone: answers.phone_number }),
  },
  page: { name: "Page" },
  steps: ({ step, resolve, text }) => [
    step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      autocomplete: "given-name",
    }),
    step.text({
      key: "last_name",
      slug: "apellido",
      label: "Apellido",
      autocomplete: "family-name",
    }),
    step.phone({
      key: "phone_number",
      slug: "telefono",
      label: "Telefono",
    }),
    step.text({
      key: "residence_state",
      slug: "estado",
      label: "Estado",
      autocomplete: "address-level1",
    }),
    step.trustedFormConsent({
      key: "trustedform_consent",
      slug: "consentimiento",
      label: "Consentimiento",
      disclosure: "Consentimiento.",
      confirmation: {
        fields: resolve(["first_name", "last_name", "phone_number", "residence_state"], ({ answers }) => [
          {
            name: "trusted_form_grantor_name",
            label: "Nombre",
            // @ts-expect-error Optional answer values require a fallback before text(...).
            value: text(answers.first_name, " ", answers.last_name, answers.residence_state),
            trustedForm: {
              role: "consent-grantor-name",
            },
          },
          {
            name: "trusted_form_grantor_phone",
            label: "Teléfono",
            value: text(answers.phone_number),
            trustedForm: {
              role: "consent-grantor-phone",
            },
          },
        ]),
      },
    }),
    step.trustedFormConsent({
      key: "trustedform_consent_with_fallback",
      slug: "consentimiento-fallback",
      label: "Consentimiento",
      disclosure: "Consentimiento.",
      confirmation: {
        fields: resolve(["first_name", "last_name", "phone_number", "residence_state"], ({ answers }) => [
          {
            name: "trusted_form_grantor_name",
            label: "Nombre",
            value: text(answers.first_name, " ", answers.last_name, " ", answers.residence_state ?? "TN"),
            trustedForm: {
              role: "consent-grantor-name",
            },
          },
          {
            name: "trusted_form_grantor_phone",
            label: "Teléfono",
            value: text(answers.phone_number),
            trustedForm: {
              role: "consent-grantor-phone",
            },
          },
        ]),
      },
    }),
  ],
});

void ({
  key: "trustedform_consent",
  slug: "consentimiento",
  label: "Consentimiento",
  disclosure: "Consentimiento.",
  confirmation: {
    fields: resolve(["first_name"], ({ answers }) => [
      {
        name: "trusted_form_grantor_name",
        label: "Nombre",
        value: text(answers.first_name),
        trustedForm: {
          role: "consent-grantor-name",
        },
      },
      {
        name: "trusted_form_grantor_phone",
        label: "Teléfono",
        // @ts-expect-error Resolver answers are limited to declared dependency keys.
        value: text(answers.phone_number),
        trustedForm: {
          role: "consent-grantor-phone",
        },
      },
    ]),
  },
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  label: "Consentimiento",
  disclosure: "Consentimiento.",
  confirmation: {
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Static strings remain valid outside resolver outputs.",
      },
    ],
  },
  // @ts-expect-error grantorSummary is intentionally removed; confirmation.fields is the only review/tagging API.
  grantorSummary: resolve(["first_name"], ({ answers }) => ({
    fields: [
      {
        name: "trusted_form_grantor_name",
        label: "Nombre",
        value: text(answers.first_name),
        trustedForm: {
          role: "consent-grantor-name",
        },
      },
    ],
  })),
} satisfies TrustedFormConsentStepInput);

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  label: "Consentimiento",
  disclosure: "Consentimiento.",
  confirmation: {
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  trustedForm: {
    preloadAssets: "previous_step",
    execute: "on_review_mount",
    requireReadyBefore: "consent_substep",
  },
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  label: "Consentimiento",
  disclosure: "Consentimiento.",
  confirmation: {
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  trustedForm: {
    // @ts-expect-error TrustedForm readiness cannot be deferred until native submit.
    requireReadyBefore: "native_submit",
  },
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
      benefits: resolve(["has_license"], ({ answers }) => [text(answers.has_license)]),
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
