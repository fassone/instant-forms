import { esGenericAutoInsuranceTemplate } from "../templates/es-auto-insurance";
import { esGenericHomeInsuranceTemplate } from "../templates/es-home-insurance";
import { defaultAutoInsuranceVariables } from "./auto/shared";
import { defaultHomeInsuranceVariables } from "./home/shared";

// Generic flows own their configuration; state-specific pixel maps do not apply.
export const genericAutoFlow = esGenericAutoInsuranceTemplate.create({
  ...defaultAutoInsuranceVariables,
  flowName: "ES - Auto - Generic",
});

export const genericHomeFlow = esGenericHomeInsuranceTemplate.create({
  ...defaultHomeInsuranceVariables,
  flowName: "ES - Home - Generic",
});
