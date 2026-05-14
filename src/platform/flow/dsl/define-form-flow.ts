import type { FormFlowInput, InstantForm } from "./types";

export function defineFormFlow(input: FormFlowInput): InstantForm {
  return {
    ...input,
    areaCode: input.areaCode.trim().toLowerCase(),
  };
}
