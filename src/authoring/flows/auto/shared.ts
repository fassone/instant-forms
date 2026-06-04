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
  metaTestEventCode: process.env.META_TEST_EVENT_CODE,
  metaConversionsAccessToken:
    process.env.NODE_ENV === "test" ? undefined : process.env.META_CONVERSIONS_ACCESS_TOKEN || undefined,
  postHogProjectApiKey: process.env.POSTHOG_PROJECT_API_KEY || undefined,
  postHogApiHost: process.env.POSTHOG_API_HOST || "https://us.i.posthog.com",
  trackingVisitorIdCookieMaxAgeSeconds: 365 * 24 * 60 * 60,
  trackingSessionIdCookieMaxAgeSeconds: 30 * 60,
} as const satisfies Pick<
  EsAutoInsuranceVariables,
  | "advertiserName"
  | "gtmContainerId"
  | "metaConversionsAccessToken"
  | "metaTestEventCode"
  | "pageName"
  | "postHogApiHost"
  | "postHogProjectApiKey"
  | "product"
  | "submissionUrl"
  | "trackingSessionIdCookieMaxAgeSeconds"
  | "trackingVisitorIdCookieMaxAgeSeconds"
>;

export type CreateAutoInsuranceFlowInput = Pick<
  EsAutoInsuranceVariables,
  "areaCode" | "areaName" | "flowName"
> &
  Partial<
    Pick<
      EsAutoInsuranceVariables,
      | "metaConversionsAccessToken"
      | "metaPixelId"
      | "metaTestEventCode"
      | "postHogApiHost"
      | "postHogProjectApiKey"
      | "trackingSessionIdCookieMaxAgeSeconds"
      | "trackingVisitorIdCookieMaxAgeSeconds"
    >
  >;

export function createAutoInsuranceFlow(input: CreateAutoInsuranceFlowInput): InstantForm {
  return esAutoInsuranceTemplate.create({
    ...defaultAutoInsuranceVariables,
    ...input,
  });
}
