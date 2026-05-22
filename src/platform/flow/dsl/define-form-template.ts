import type { z } from "zod";

import type { InstantForm } from "./types";

type FormTemplateVariablesSchema = z.ZodObject<z.ZodRawShape>;

export type FormTemplateCreateInput<TVariables extends FormTemplateVariablesSchema> = {
  variables: z.output<TVariables>;
};

export type FormTemplate<
  TVariables extends FormTemplateVariablesSchema,
  TForm extends InstantForm = InstantForm,
> = {
  variables: TVariables;
  create: (input: z.input<TVariables>) => TForm;
};

export type FormTemplateInput<
  TVariables extends FormTemplateVariablesSchema,
  TForm extends InstantForm = InstantForm,
> = {
  variables: TVariables;
  create: (input: FormTemplateCreateInput<TVariables>) => TForm;
};

export function defineFormTemplate<
  const TVariables extends FormTemplateVariablesSchema,
  TForm extends InstantForm = InstantForm,
>(input: FormTemplateInput<TVariables, TForm>): FormTemplate<TVariables, TForm> {
  return {
    variables: input.variables,
    create: (variablesInput) => {
      assertKnownTemplateVariableKeys(input.variables, variablesInput);
      const validation = input.variables.safeParse(variablesInput);

      if (!validation.success) {
        throw new Error(`template variables do not match the template contract: ${validation.error.message}`);
      }

      return input.create({ variables: validation.data as z.output<TVariables> });
    },
  };
}

function assertKnownTemplateVariableKeys(schema: FormTemplateVariablesSchema, input: unknown): void {
  if (!isRecord(input)) {
    throw new Error("template variables must be an object.");
  }

  const knownKeys = new Set(Object.keys(schema.shape));
  const unknownKeys = Object.keys(input).filter((key) => !knownKeys.has(key));

  if (unknownKeys.length > 0) {
    throw new Error(`template variables include undeclared keys: ${unknownKeys.join(", ")}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
