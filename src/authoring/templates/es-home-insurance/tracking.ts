import type {
  FormTracking,
  GoogleTagManagerContainerId,
  MetaPixelId,
  TrackingAuthoringHelpers,
} from "../../../platform/flow";
import { googleTagManager } from "../../integrations/google-tag-manager";
import {
  createMetaConversionsEffect,
  createPostHogCaptureEffect,
  createTrackingServerEffects,
} from "../../integrations/server-tracking-effects";
import { getCapturedLeadAttribution } from "./attribution";
import type { HomeInsuranceContract } from "./contracts";

type CreateHomeInsuranceTrackingInput = {
  gtmContainerId?: GoogleTagManagerContainerId;
  metaPixelId?: MetaPixelId;
  metaTestEventCode?: string;
  metaConversionsAccessToken?: string;
  postHogProjectApiKey?: string;
  postHogApiHost?: string;
  trackingVisitorIdCookieMaxAgeSeconds: number;
};

export function createHomeInsuranceTracking({
  gtmContainerId,
  metaPixelId,
  metaTestEventCode,
  metaConversionsAccessToken,
  postHogProjectApiKey,
  postHogApiHost,
  trackingVisitorIdCookieMaxAgeSeconds,
}: CreateHomeInsuranceTrackingInput):
  | ((helpers: TrackingAuthoringHelpers<HomeInsuranceContract>) => FormTracking<HomeInsuranceContract>)
  | undefined {
  const serverEffects = createTrackingServerEffects<HomeInsuranceContract>([
    ...(metaPixelId && metaConversionsAccessToken
      ? [createMetaConversionsEffect<HomeInsuranceContract>(metaConversionsAccessToken)]
      : []),
    ...(postHogProjectApiKey && postHogApiHost
      ? [
          createPostHogCaptureEffect<HomeInsuranceContract>({
            projectApiKey: postHogProjectApiKey,
            apiHost: postHogApiHost,
            getProperties: ({ cookies }) => {
              const attribution = getCapturedLeadAttribution(cookies);

              return {
                source_channel: attribution.sourceChannel,
                acquisition_channel: attribution.acquisitionChannel,
                platform: attribution.platform,
              };
            },
          }),
        ]
      : []),
  ]);

  if (!gtmContainerId && !serverEffects) {
    return undefined;
  }

  return ({ event }: TrackingAuthoringHelpers<HomeInsuranceContract>) => ({
    ...(serverEffects
      ? {
          visitorId: {
            cookie: {
              name: "instant_forms_visitor_id",
              maxAgeSeconds: trackingVisitorIdCookieMaxAgeSeconds,
            },
          },
        }
      : {}),
    ...(gtmContainerId
      ? {
          googleTagManager: googleTagManager({
            containerId: gtmContainerId,
            delivery: "partytown",
            proxy: "first_party",
          }),
        }
      : {}),
    events: [
      event.formView({
        name: "instant_form_view",
        includeContext: ["areaCode", "product"],
      }),
      event.stepView({
        name: "instant_form_step_view",
        includeContext: ["areaCode", "product"],
        includeStep: true,
      }),
      event.stepAnswer({
        name: "instant_form_step_answer",
        includeStep: true,
        ...(metaPixelId
          ? {
              meta: {
                pixelId: metaPixelId,
                eventName: "LeadProgress",
                ...(metaTestEventCode ? { testEventCode: metaTestEventCode } : {}),
                eventId: ({ event }) => event.id,
                userData: ({ context, answers }) => ({
                  ph: answers.phone_number,
                  fn: answers.first_name,
                  ln: answers.last_name,
                  st: answers.property_in_state === "yes" ? context.areaCode : answers.property_state,
                }),
                customData: ({ context, answers, step }) => ({
                  content_name: context.product,
                  content_category: "insurance",
                  market_state: context.areaCode,
                  market_name: context.areaName ?? context.areaCode,
                  property_state: answers.property_in_state === "yes" ? context.areaCode : answers.property_state,
                  property_in_state: answers.property_in_state,
                  ownership_status: answers.ownership_status,
                  property_type: answers.property_type,
                  property_use: answers.property_use,
                  has_home_insurance: answers.has_home_insurance,
                  house_age_years: answers.house_age_years,
                  roof_age_years: answers.roof_age_years,
                  funnel_step: step?.key,
                }),
              },
            }
          : {}),
        ...(serverEffects ? { server: serverEffects } : {}),
      }),
      event.validationError({
        name: "instant_form_validation_error",
        includeStep: true,
      }),
      event.trustedFormSubstepView({
        name: "instant_form_trusted_form_substep_view",
        includeStep: true,
        ...(metaPixelId
          ? {
              meta: {
                pixelId: metaPixelId,
                eventName: "LeadProgress",
                ...(metaTestEventCode ? { testEventCode: metaTestEventCode } : {}),
                eventId: ({ event }) => event.id,
                userData: ({ context, answers }) => ({
                  ph: answers.phone_number,
                  fn: answers.first_name,
                  ln: answers.last_name,
                  st: answers.property_in_state === "yes" ? context.areaCode : answers.property_state,
                }),
                customData: ({ context, answers, step, event }) => ({
                  content_name: context.product,
                  content_category: "insurance",
                  market_state: context.areaCode,
                  market_name: context.areaName ?? context.areaCode,
                  property_state: answers.property_in_state === "yes" ? context.areaCode : answers.property_state,
                  property_in_state: answers.property_in_state,
                  ownership_status: answers.ownership_status,
                  property_type: answers.property_type,
                  property_use: answers.property_use,
                  has_home_insurance: answers.has_home_insurance,
                  house_age_years: answers.house_age_years,
                  roof_age_years: answers.roof_age_years,
                  funnel_step: step?.key,
                  trusted_form_substep: event.trustedFormSubstep,
                }),
              },
            }
          : {}),
        ...(serverEffects ? { server: serverEffects } : {}),
      }),
      event.submitAttempt({
        name: "instant_form_submit_attempt",
        includeStep: true,
      }),
      event.submitSuccess({
        name: "instant_form_submit_success",
        includeContext: ["areaCode", "product"],
        ...(serverEffects ? { server: serverEffects } : {}),
      }),
      event.submitError({
        name: "instant_form_submit_error",
        includeStep: true,
      }),
    ],
  });
}
