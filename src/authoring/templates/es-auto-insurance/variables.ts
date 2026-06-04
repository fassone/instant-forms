import { z } from "../../../platform/flow";
import {
  gtmContainerIdSchema,
  metaPixelIdSchema,
  metaTestEventCodeSchema,
} from "../../integrations/google-tag-manager";
import { lidernaAreaCodeSchema } from "./contracts";

export const esAutoInsuranceVariables = z.object({
  flowName: z.string(),
  pageName: z.string(),
  submissionUrl: z.string().url(),
  areaCode: lidernaAreaCodeSchema,
  areaName: z.string().optional(),
  product: z.string(),
  advertiserName: z.string(),
  gtmContainerId: gtmContainerIdSchema.optional(),
  metaPixelId: metaPixelIdSchema.optional(),
  metaTestEventCode: metaTestEventCodeSchema.optional(),
  metaConversionsAccessToken: z.string().min(1, "Expected a Meta Conversions API access token").optional(),
  postHogProjectApiKey: z.string().min(1, "Expected a PostHog project API key").optional(),
  postHogApiHost: z.string().url("Expected a PostHog API host URL").optional(),
  trackingVisitorIdCookieMaxAgeSeconds: z.number().int().positive(),
  trackingSessionIdCookieMaxAgeSeconds: z.number().int().positive(),
});

export type EsAutoInsuranceVariables = z.output<typeof esAutoInsuranceVariables>;
