import { defineFormFlow, step, z } from "../../src/platform/flow";

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
