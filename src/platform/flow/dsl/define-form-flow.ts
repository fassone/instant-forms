import type { FormFlowInput, InstantForm } from "./types";

export function defineFormFlow(input: FormFlowInput): InstantForm {
  return {
    ...input,
    customVariables: normalizeCustomVariables(input.customVariables),
  };
}

function normalizeCustomVariables(input: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.trim()]));
}
