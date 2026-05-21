import { defineFormFlow, md, resolve, step, text, z, type TrustedFormConsentStepInput } from "../../src/platform/flow";

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
  steps: ({ step, text, md }) => [
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
    step.trustedFormConsent(
      {
        key: "trustedform_consent",
        slug: "consentimiento",
      },
      ["first_name"],
      ({ answers }) => ({
        review: {
          title: text("Consentimiento"),
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
        },
        consent: {
          title: text("Consentimiento"),
          disclosure: md("Consentimiento."),
        },
      }),
    ),
  ],
});

declare const maybeName: string | undefined;

// @ts-expect-error text(...) rejects undefined parts.
void text("Hello ", undefined);

// @ts-expect-error text(...) requires optional values to be handled before concatenation.
void text("Hello ", maybeName);

void text("Hello ", maybeName ?? "Michel");

// @ts-expect-error md(...) rejects undefined parts.
void md("Hello ", undefined);

// @ts-expect-error md(...) requires optional values to be handled before concatenation.
void md("Hello ", maybeName);

void md("Hello ", maybeName ?? "Michel");

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    // @ts-expect-error Titles are plain text, not markdown display copy.
    title: md("**Consentimiento**"),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  consent: {
    // @ts-expect-error Titles are plain text, not markdown display copy.
    title: md("**Consentimiento**"),
    disclosure: md("Consentimiento."),
  },
});

void step.interstitial({
  key: "matching_offer",
  slug: "buscando",
  label: "Buscando",
  successLines: [{ text: "Listo", color: "accent" }],
  // @ts-expect-error Nested resolve(...) is not accepted in step fields.
  benefits: resolve([], () => ["plain string"]),
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    title: text("Consentimiento"),
    // @ts-expect-error Nested resolve(...) is not accepted in step fields.
    fields: resolve([], () => [
      {
        name: "review_name",
        label: "Nombre",
        value: "plain string",
      },
    ]),
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Consentimiento."),
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
  steps: ({ step, text }) => [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.interstitial(
      {
        key: "matching_offer",
        slug: "buscando",
        label: "Buscando",
        successLines: [{ text: "Listo", color: "accent" }],
      },
      [],
      ({ context }) => ({
        benefits: [
        // @ts-expect-error Optional context requires a fallback before text(...).
        text("Area ", context.areaName),
        text("Area ", context.areaName ?? context.areaCode),
        ],
      }),
    ),
  ],
});

void defineFormFlow({
  name: "Dynamic Markdown Fixture",
  status: "ACTIVE",
  contract,
  context: {},
  payload,
  page: { name: "Page" },
  steps: ({ step, md, text }) => [
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
    step.trustedFormConsent(
      {
        key: "trustedform_consent",
        slug: "consentimiento",
      },
      ["first_name"],
      ({ answers }) => ({
        review: {
          title: text("Revise la información de **", answers.first_name, "** antes de continuar."),
          fields: [
            {
              name: "review_name",
              label: "Nombre",
              value: text(answers.first_name),
            },
          ],
        },
        consent: {
          title: text("Consentimiento"),
          description: md("Último paso antes de enviar."),
          disclosure: md("Autorizo a **Seguros Aseguranza** a contactarme."),
        },
      }),
    ),
  ],
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    // @ts-expect-error Nested resolve(...) is not accepted in step fields.
    title: resolve(["first_name"], ({ answers }) =>
      md("Revise la información de **", answers.first_name, "** antes de continuar."),
    ),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Autorizo a **Seguros Aseguranza** a contactarme."),
  },
});

void defineFormFlow({
  name: "Invalid Dynamic Resolver Body",
  status: "ACTIVE",
  contract,
  context: {},
  payload,
  page: { name: "Page" },
  steps: ({ step, md, text }) => [
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
    step.trustedFormConsent(
      {
        key: "trustedform_consent",
        slug: "consentimiento",
      },
      ["first_name"],
      () => ({
        review: {
          // @ts-expect-error Dynamic titles must be created with text(...).
          title: "Plain dynamic title",
          fields: [
            {
              name: "review_name",
              label: "Nombre",
              // @ts-expect-error Dynamic submitted values must be created with text(...).
              value: "Ana",
            },
            {
              name: "trusted_form_grantor_name",
              label: "Nombre",
              value: text("Ana"),
            },
          ],
        },
        consent: {
          title: text("Consentimiento"),
          // @ts-expect-error Dynamic display copy must be created with md(...).
          disclosure: "Plain dynamic disclosure",
        },
      }),
    ),
  ],
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    // @ts-expect-error Nested resolvers are not accepted in title fields.
    title: resolve(["first_name"], ({ answers }) => `Hola ${answers.first_name}`),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Autorizo a **Seguros Aseguranza** a contactarme."),
  },
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    title: text("Consentimiento"),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        // @ts-expect-error Review field values are submitted values and must use text/plain strings, not markdown.
        value: md("**Ana**"),
      },
    ],
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Autorizo a **Seguros Aseguranza** a contactarme."),
    // @ts-expect-error Button labels are native control text, not markdown display copy.
    submitLabel: md("**Enviar**"),
  },
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
  steps: ({ step, text, md }) => [
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
    step.trustedFormConsent(
      {
        key: "trustedform_consent",
        slug: "consentimiento",
      },
      ["first_name", "last_name", "phone_number", "residence_state"],
      ({ answers }) => ({
        review: {
          title: text("Consentimiento"),
          fields: [
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
          ],
        },
        consent: {
          title: text("Consentimiento"),
          disclosure: md("Consentimiento."),
        },
      }),
    ),
    step.trustedFormConsent(
      {
        key: "trustedform_consent_with_fallback",
        slug: "consentimiento-fallback",
      },
      ["first_name", "last_name", "phone_number", "residence_state"],
      ({ answers }) => ({
        review: {
          title: text("Consentimiento"),
          fields: [
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
          ],
        },
        consent: {
          title: text("Consentimiento"),
          disclosure: md("Consentimiento."),
        },
      }),
    ),
  ],
});

void ({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    title: text("Consentimiento"),
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
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Consentimiento."),
  },
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    title: text("Consentimiento"),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Static strings remain valid outside resolver outputs.",
      },
    ],
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Consentimiento."),
  },
  // @ts-expect-error grantorSummary is intentionally removed; review.fields is the only review/tagging API.
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
  // @ts-expect-error top-level label was removed; review.title and consent.title are explicit.
  label: "Consentimiento",
  review: {
    title: text("Consentimiento"),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Consentimiento."),
  },
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    title: text("Consentimiento"),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Consentimiento."),
  },
  // @ts-expect-error confirmation was removed; use review.fields instead.
  confirmation: {
    fields: [],
  },
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    title: text("Consentimiento"),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Consentimiento."),
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
  review: {
    title: text("Consentimiento"),
    fields: [
      {
        name: "review_name",
        label: "Nombre",
        value: "Ana",
      },
    ],
  },
  consent: {
    title: text("Consentimiento"),
    disclosure: md("Consentimiento."),
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
    step.interstitial(
      {
        key: "matching_offer",
        slug: "buscando",
        label: "Buscando",
        successLines: [{ text: "Listo", color: "accent" }],
      },
      ["has_license"],
      ({ answers }) => ({
        benefits: [text(answers.has_license)],
      }),
    ),
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
