import { createAutoInsuranceFlow } from "../shared";

export const tnFlow = createAutoInsuranceFlow({
  flowName: "ES - TN - v6",
  areaCode: "TN",
  areaName: "Tennessee",
  metaPixelId: "1465068051587670",
  metaTestEventCode: process.env.META_TEST_EVENT_CODE,
  metaConversionsAccessToken:
    process.env.NODE_ENV === "test" ? undefined : process.env.META_CONVERSIONS_ACCESS_TOKEN || undefined,
});
