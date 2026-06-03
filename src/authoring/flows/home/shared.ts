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
  postHogProjectApiKey: process.env.POSTHOG_PROJECT_API_KEY || undefined,
  postHogApiHost: process.env.POSTHOG_API_HOST || "https://us.i.posthog.com",
  trackingVisitorIdCookieMaxAgeSeconds: 365 * 24 * 60 * 60,
} as const satisfies Pick<
  EsHomeInsuranceVariables,
  | "advertiserName"
  | "gtmContainerId"
  | "metaConversionsAccessToken"
  | "metaTestEventCode"
  | "pageName"
  | "postHogApiHost"
  | "postHogProjectApiKey"
  | "product"
  | "submissionUrl"
  | "trackingVisitorIdCookieMaxAgeSeconds"
>;

export type CreateHomeInsuranceFlowInput = Pick<
  EsHomeInsuranceVariables,
  "areaCode" | "areaName" | "flowName"
> &
  Partial<
    Pick<
      EsHomeInsuranceVariables,
      | "metaConversionsAccessToken"
      | "metaPixelId"
      | "metaTestEventCode"
      | "postHogApiHost"
      | "postHogProjectApiKey"
      | "trackingVisitorIdCookieMaxAgeSeconds"
    >
  >;

export function createHomeInsuranceFlow(input: CreateHomeInsuranceFlowInput): InstantForm {
  return esHomeInsuranceTemplate.create({
    ...defaultHomeInsuranceVariables,
    ...input,
  });
}
