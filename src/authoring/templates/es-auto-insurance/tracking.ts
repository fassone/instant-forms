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
import type { AutoInsuranceContract } from "./contracts";

const safePostHogAnswerKeys = new Set<string>([
  "belongs_to_state",
  "residence_state",
  "has_license",
  "has_insurance",
  "is_clean_title",
  "number_of_registered_cars",
]);

type CreateAutoInsuranceTrackingInput = {
  gtmContainerId?: GoogleTagManagerContainerId;
  metaPixelId?: MetaPixelId;
  metaTestEventCode?: string;
  metaConversionsAccessToken?: string;
  postHogProjectApiKey?: string;
  postHogApiHost?: string;
  trackingVisitorIdCookieMaxAgeSeconds: number;
};

export function createAutoInsuranceTracking({
  gtmContainerId,
  metaPixelId,
  metaTestEventCode,
  metaConversionsAccessToken,
  postHogProjectApiKey,
  postHogApiHost,
  trackingVisitorIdCookieMaxAgeSeconds,
}: CreateAutoInsuranceTrackingInput):
  | ((helpers: TrackingAuthoringHelpers<AutoInsuranceContract>) => FormTracking<AutoInsuranceContract>)
  | undefined {
  const serverEffects = createTrackingServerEffects<AutoInsuranceContract>([
    ...(metaPixelId && metaConversionsAccessToken
      ? [createMetaConversionsEffect<AutoInsuranceContract>(metaConversionsAccessToken)]
      : []),
    ...(postHogProjectApiKey && postHogApiHost
      ? [
          createPostHogCaptureEffect<AutoInsuranceContract>({
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
            getSafeAnswerValue: ({ answerKey, answers }) =>
              safePostHogAnswerKeys.has(answerKey) ? getStringAnswerValue(answers, answerKey) : undefined,
          }),
        ]
      : []),
  ]);

  if (!gtmContainerId && !serverEffects) {
    return undefined;
  }

  return ({ event }: TrackingAuthoringHelpers<AutoInsuranceContract>) => ({
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
        ...(serverEffects ? { server: serverEffects } : {}),
      }),
      event.stepView({
        name: "instant_form_step_view",
        includeContext: ["areaCode", "product"],
        includeStep: true,
        ...(serverEffects ? { server: serverEffects } : {}),
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
                  st: answers.belongs_to_state === "yes" ? context.areaCode : answers.residence_state,
                }),
                customData: ({ context, answers, step }) => ({
                  content_name: context.product,
                  content_category: "insurance",
                  market_state: context.areaCode,
                  market_name: context.areaName ?? context.areaCode,
                  residence_state: answers.belongs_to_state === "yes" ? context.areaCode : answers.residence_state,
                  belongs_to_state: answers.belongs_to_state,
                  has_license: answers.has_license,
                  has_insurance: answers.has_insurance,
                  is_clean_title: answers.is_clean_title,
                  number_of_registered_cars: answers.number_of_registered_cars,
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
                  st: answers.belongs_to_state === "yes" ? context.areaCode : answers.residence_state,
                }),
                customData: ({ context, answers, step, event }) => ({
                  content_name: context.product,
                  content_category: "insurance",
                  market_state: context.areaCode,
                  market_name: context.areaName ?? context.areaCode,
                  residence_state: answers.belongs_to_state === "yes" ? context.areaCode : answers.residence_state,
                  belongs_to_state: answers.belongs_to_state,
                  has_license: answers.has_license,
                  has_insurance: answers.has_insurance,
                  is_clean_title: answers.is_clean_title,
                  number_of_registered_cars: answers.number_of_registered_cars,
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

function getStringAnswerValue(answers: Record<string, unknown>, answerKey: string): string | undefined {
  const value = answers[answerKey];

  return typeof value === "string" && value.trim() ? value : undefined;
}
