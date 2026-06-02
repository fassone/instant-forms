import type { InstantForm } from "../../../platform/flow";
import { esAutoInsuranceTemplate } from "../../templates/es-auto-insurance";
import type { EsAutoInsuranceVariables } from "../../templates/es-auto-insurance/variables";

const lidernaWebleadsSubmissionUrl = process.env.LIDERNA_WEBLEADS_SUBMISSION_URL;

if (!lidernaWebleadsSubmissionUrl) {
  throw new Error("LIDERNA_WEBLEADS_SUBMISSION_URL is required for auto insurance flows.");
}

export const defaultAutoInsuranceVariables = {
  pageName: "Seguros Aseguranza",
  submissionUrl: lidernaWebleadsSubmissionUrl,
  product: "auto_insurance",
  advertiserName: "Liderna Inc y a sus socios, agentes y proveedores de seguros",
  gtmContainerId: "GTM-MVJNX5DZ",
} as const satisfies Pick<
  EsAutoInsuranceVariables,
  "advertiserName" | "gtmContainerId" | "pageName" | "product" | "submissionUrl"
>;

export type CreateAutoInsuranceFlowInput = Pick<
  EsAutoInsuranceVariables,
  "areaCode" | "areaName" | "flowName"
> &
  Partial<
    Pick<
      EsAutoInsuranceVariables,
      "metaConversionsAccessToken" | "metaPixelId" | "metaTestEventCode"
    >
  >;

export function createAutoInsuranceFlow(input: CreateAutoInsuranceFlowInput): InstantForm {
  return esAutoInsuranceTemplate.create({
    ...defaultAutoInsuranceVariables,
    ...input,
  });
}
