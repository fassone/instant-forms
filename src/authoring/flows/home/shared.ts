import type { InstantForm } from "../../../platform/flow";
import { esHomeInsuranceTemplate } from "../../templates/es-home-insurance";
import type { EsHomeInsuranceVariables } from "../../templates/es-home-insurance/variables";

const lidernaWebleadsSubmissionUrl = process.env.LIDERNA_WEBLEADS_SUBMISSION_URL;

if (!lidernaWebleadsSubmissionUrl) {
  throw new Error("LIDERNA_WEBLEADS_SUBMISSION_URL is required for home insurance flows.");
}

export const defaultHomeInsuranceVariables = {
  pageName: "Seguros Aseguranza",
  submissionUrl: lidernaWebleadsSubmissionUrl,
  product: "home_insurance",
  advertiserName: "Liderna Inc y a sus socios, agentes y proveedores de seguros",
  gtmContainerId: "GTM-MVJNX5DZ",
  metaTestEventCode: process.env.META_TEST_EVENT_CODE,
  metaConversionsAccessToken:
    process.env.NODE_ENV === "test" ? undefined : process.env.META_CONVERSIONS_ACCESS_TOKEN || undefined,
} as const satisfies Pick<
  EsHomeInsuranceVariables,
  | "advertiserName"
  | "gtmContainerId"
  | "metaConversionsAccessToken"
  | "metaTestEventCode"
  | "pageName"
  | "product"
  | "submissionUrl"
>;

export type CreateHomeInsuranceFlowInput = Pick<
  EsHomeInsuranceVariables,
  "areaCode" | "areaName" | "flowName"
> &
  Partial<
    Pick<
      EsHomeInsuranceVariables,
      "metaConversionsAccessToken" | "metaPixelId" | "metaTestEventCode"
    >
  >;

export function createHomeInsuranceFlow(input: CreateHomeInsuranceFlowInput): InstantForm {
  return esHomeInsuranceTemplate.create({
    ...defaultHomeInsuranceVariables,
    ...input,
  });
}
