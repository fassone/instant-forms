import { createAutoInsuranceFlow } from "../shared";

export const txFlow = createAutoInsuranceFlow({
  flowName: "ES - TX - v1",
  areaCode: "TX",
  areaName: "Texas",
});
