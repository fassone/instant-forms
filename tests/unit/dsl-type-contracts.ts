import {
  consentMd,
  defineFormFlow,
  defineFormTemplate,
  md,
  phoneDisplay,
  resolve,
  stateDisplay,
  step,
  text,
  tfTag,
  z,
  type TrustedFormConsentStepInput,
} from "../../src/platform/flow";
import { trustedFormCertify } from "../../src/authoring/integrations/trusted-form";

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

const testFlowCopy = {
  locale: "en",
  ui: {
    actions: {
      back: "Back",
      next: "Next",
      submit: "Submit",
      loading: "Submitting...",
    },
    progress: {
      stepCount: "Step {{current}} of {{total}}",
    },
    errorModal: {
      title: "Check this answer",
      closeLabel: "Got it",
    },
    errors: {
      requiredAnswer: "This answer is required.",
      invalidChoice: "Select a valid option.",
      invalidPhone: "Enter a valid United States phone number.",
      invalidAutocomplete: "Enter a valid answer.",
      unavailableQuestion: "This question is not available.",
      incompleteStep: "We could not complete this step.",
      checkpointSaveFailed: "We could not save this answer.",
      checkpointStepSaveFailed: "We could not save this step.",
      stepResolutionFailed: "We could not prepare this step.",
      submissionFailed: "We could not submit the form.",
      trustedFormCertFailed: "We could not prepare the consent certificate. Check your connection and try again.",
    },
    pages: {
      thankYou: {
        title: "Thanks.",
        message: "We received your information.",
      },
      nativeSubmissionError: {
        title: "We could not submit the form",
        heading: "We could not submit the form.",
        fallbackMessage: "We could not submit the form.",
      },
    },
  },
} as const;

const typedTemplate = defineFormTemplate({
  variables: z.object({
    flowName: z.string(),
    areaCode: z.string(),
    areaName: z.string().optional(),
  }),
  create: ({ variables }) =>
    defineFormFlow({
      name: variables.flowName,
      status: "ACTIVE",
      ...testFlowCopy,
      contract: {
        context: z.object({
          areaCode: z.string(),
          areaName: z.string().optional(),
        }),
        answers: z.object({}),
        payload: z.object({ marketState: z.string() }),
      },
      context: {
        areaCode: variables.areaCode,
        areaName: variables.areaName,
      },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ context }) => ({ marketState: context.areaCode }),
      },
      page: { name: variables.flowName },
      steps: [],
    }),
});

void typedTemplate.create({ flowName: "Typed Template", areaCode: "TX" });
void typedTemplate.create({ flowName: "Typed Template", areaCode: "TX", areaName: "Texas" });

// @ts-expect-error template variables require flowName.
void typedTemplate.create({ areaCode: "TX" });

// @ts-expect-error template variables reject unknown object literal keys.
void typedTemplate.create({ flowName: "Typed Template", areaCode: "TX", extraVariable: "nope" });

// @ts-expect-error template variables use the Zod input type.
void typedTemplate.create({ flowName: "Typed Template", areaCode: 123 });

void trustedFormCertify({ delivery: "partytown", allowSubmitWithoutCert: false });

void trustedFormCertify({
  // @ts-expect-error TrustedForm preset delivery only accepts supported runtime modes.
  delivery: "worker",
});

void trustedFormCertify({
  // @ts-expect-error TrustedForm preset overrides do not expose stable low-level config.
  fieldName: "otherField",
});

void defineFormFlow({
  name: "Desktop Height Type Fixture",
  status: "ACTIVE",
  ...testFlowCopy,
  contract: {
    context: z.object({}),
    answers: z.object({}),
    payload: z.object({ ok: z.string() }),
  },
  context: {},
  payload: {
    method: "POST",
    encoding: "json",
    mapping: () => ({ ok: "yes" }),
  },
  page: {
    name: "Page",
    presentation: {
      desktopHeightPx: 780,
    },
  },
  steps: [],
});

void defineFormFlow({
  name: "Invalid Desktop Height Type Fixture",
  status: "ACTIVE",
  ...testFlowCopy,
  contract: {
    context: z.object({}),
    answers: z.object({}),
    payload: z.object({ ok: z.string() }),
  },
  context: {},
  payload: {
    method: "POST",
    encoding: "json",
    mapping: () => ({ ok: "yes" }),
  },
  page: {
    name: "Page",
    presentation: {
      // @ts-expect-error desktopHeightPx is numeric pixels, not a CSS string.
      desktopHeightPx: "780px",
    },
  },
  steps: [],
});

void defineFormFlow({
  name: "Valid Type Fixture",
  status: "ACTIVE",
  ...testFlowCopy,
  contract,
  context: {},
  payload,
  page: { name: "Page" },
  steps: ({ step, text, md }) => [
    step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      presentation: {
        chrome: "hidden_on_mobile",
      },
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
  ...testFlowCopy,
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
        presentation: {
          chrome: "visible",
        },
        substeps: {
          consent: {
            presentation: {
              chrome: "hidden_on_mobile",
            },
          },
        },
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
          disclosure: consentMd("Consentimiento."),
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

step.choice({
  key: "belongs_to_state",
  slug: "vive",
  label: "Vive aqui?",
  // @ts-expect-error presentation.chrome only accepts visible, hidden, or hidden_on_mobile.
  presentation: { chrome: "hidden_on_tablet" },
  options: [
    { key: "yes", label: "Si" },
    { key: "no", label: "No" },
  ],
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    title: text("Consentimiento"),
    // @ts-expect-error Substep-specific presentation belongs under substeps.review, not review copy.
    presentation: {
      chrome: "hidden_on_mobile",
    },
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
    disclosure: consentMd("Consentimiento."),
    // @ts-expect-error Substep-specific presentation belongs under substeps.consent, not consent copy.
    presentation: {
      chrome: "hidden_on_mobile",
    },
  },
});

void phoneDisplay("+17864746654");
void phoneDisplay(text("+17864746654"));

// @ts-expect-error phoneDisplay(...) rejects undefined values.
void phoneDisplay(undefined);

// @ts-expect-error phoneDisplay(...) requires optional values to be handled before formatting.
void phoneDisplay(maybeName);

void phoneDisplay(maybeName ?? "+17864746654");

void stateDisplay("TN");
void stateDisplay(text("TN"));

// @ts-expect-error stateDisplay(...) rejects undefined values.
void stateDisplay(undefined);

// @ts-expect-error stateDisplay(...) requires optional values to be handled before formatting.
void stateDisplay(maybeName);

void stateDisplay(maybeName ?? "No indicado");

// @ts-expect-error md(...) rejects undefined parts.
void md("Hello ", undefined);

// @ts-expect-error md(...) requires optional values to be handled before concatenation.
void md("Hello ", maybeName);

void md("Hello ", maybeName ?? "Michel");

// @ts-expect-error consentMd(...) rejects undefined parts.
void consentMd("Hello ", undefined);

// @ts-expect-error consentMd(...) requires optional values to be handled before concatenation.
void consentMd("Hello ", maybeName);

void consentMd("Hello ", maybeName ?? "Michel");

void tfTag("contact-method", "teléfono o mensaje de texto");
void tfTag("consent-grantor-phone", phoneDisplay("+17864746654"));
void tfTag("consent-grantor-address", stateDisplay("TN"));
void consentMd("Autorizo a ", tfTag("consent-advertiser-name", "Seguros Aseguranza"), ".");

// @ts-expect-error tfTag(...) only accepts ActiveProspect inline consent tag roles.
void tfTag("unknown-role", "text");

// @ts-expect-error offer is structural and rendered by the platform, not an inline consent tag.
void tfTag("offer", "text");

// @ts-expect-error submit is structural and rendered by the platform, not an inline consent tag.
void tfTag("submit", "text");

// @ts-expect-error consent-language is structural and rendered by the platform, not an inline consent tag.
void tfTag("consent-language", "text");

// @ts-expect-error consent-opt-in is structural and rendered by the platform, not an inline consent tag.
void tfTag("consent-opt-in", "text");

// @ts-expect-error opted advertiser pairs require a dedicated selectable advertiser DSL.
void tfTag("consent-opted-advertiser-input-1", "text");

// @ts-expect-error opted advertiser pairs require a dedicated selectable advertiser DSL.
void tfTag("consent-opted-advertiser-name-1", "text");

// @ts-expect-error tfTag(...) requires optional values to be handled before tagging.
void tfTag("contact-method", maybeName);

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
    disclosure: consentMd("Consentimiento."),
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
    disclosure: consentMd("Consentimiento."),
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
  ...testFlowCopy,
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
  ...testFlowCopy,
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
          disclosure: consentMd("Autorizo a **Seguros Aseguranza** a contactarme."),
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
    disclosure: consentMd("Autorizo a **Seguros Aseguranza** a contactarme."),
  },
});

void defineFormFlow({
  name: "Invalid Dynamic Resolver Body",
  status: "ACTIVE",
  ...testFlowCopy,
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
          // @ts-expect-error Dynamic disclosure copy must be created with consentMd(...).
          disclosure: "Plain dynamic disclosure",
          // @ts-expect-error Dynamic resolvers cannot change static presentation fields.
          presentation: {
            chrome: "hidden",
          },
        },
        // @ts-expect-error Dynamic resolvers cannot change static substep presentation fields.
        substeps: {
          consent: {
            presentation: {
              chrome: "hidden_on_mobile",
            },
          },
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
    disclosure: consentMd("Autorizo a **Seguros Aseguranza** a contactarme."),
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
    disclosure: consentMd("Autorizo a **Seguros Aseguranza** a contactarme."),
    // @ts-expect-error Button labels are native control text, not markdown display copy.
    submitLabel: md("**Enviar**"),
  },
});

void step.trustedFormConsent({
  key: "trustedform_consent",
  slug: "consentimiento",
  review: {
    title: text("Consentimiento"),
    // @ts-expect-error consentMd(...) is only for the TrustedForm disclosure.
    description: consentMd("Revise esta información."),
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
    // @ts-expect-error consent.description is general prose and must use md(...), not consentMd(...).
    description: consentMd("Último paso."),
    disclosure: consentMd("Autorizo a ", tfTag("consent-advertiser-name", "Seguros Aseguranza"), "."),
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
    // @ts-expect-error TrustedForm disclosure must use consentMd(...), not plain md(...).
    disclosure: md("Autorizo a **Seguros Aseguranza** a contactarme."),
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
  ...testFlowCopy,
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
          disclosure: consentMd("Consentimiento."),
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
          disclosure: consentMd("Consentimiento."),
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
    disclosure: consentMd("Consentimiento."),
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
    disclosure: consentMd("Consentimiento."),
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
    disclosure: consentMd("Consentimiento."),
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
    disclosure: consentMd("Consentimiento."),
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
    disclosure: consentMd("Consentimiento."),
  },
  trustedForm: {
    preloadAssets: "previous_step",
    execute: "on_step_mount",
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
    disclosure: consentMd("Consentimiento."),
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
  ...testFlowCopy,
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
  ...testFlowCopy,
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
  ...testFlowCopy,
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
  ...testFlowCopy,
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
  ...testFlowCopy,
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
