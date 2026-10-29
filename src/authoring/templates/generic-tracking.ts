import type {
  FormContract,
  FormTracking,
  TrackingAuthoringHelpers,
  ContractSchemaKeys,
  GoogleTagManagerContainerId,
  MetaPixelId,
} from "../../platform/flow";
import { googleTagManager } from "../integrations/google-tag-manager";
import {
  createMetaConversionsEffect,
  createPostHogCaptureEffect,
  createTrackingServerEffects,
} from "../integrations/server-tracking-effects";
import { getCapturedLeadAttribution } from "./es-auto-insurance/attribution";

export function createGenericInsuranceTracking<T extends FormContract>(options: {
  gtmContainerId?: GoogleTagManagerContainerId;
  metaPixelId?: MetaPixelId;
  metaTestEventCode?: string;
  metaConversionsAccessToken?: string;
  postHogProjectApiKey?: string;
  postHogApiHost?: string;
  trackingVisitorIdCookieMaxAgeSeconds: number;
  trackingSessionIdCookieMaxAgeSeconds: number;
  stateAnswerKey: string;
  safeAnswerKeys: ReadonlySet<string>;
  includeContext: readonly ContractSchemaKeys<T["context"]>[];
}): ((helpers: TrackingAuthoringHelpers<T>) => FormTracking<T>) | undefined {
  const postHog = options.postHogProjectApiKey && options.postHogApiHost
    ? createPostHogCaptureEffect<T>({
        projectApiKey: options.postHogProjectApiKey,
        apiHost: options.postHogApiHost,
        getProperties: ({ cookies }) => {
          const attribution = getCapturedLeadAttribution(cookies);
          return {
            source_channel: attribution.sourceChannel,
            acquisition_channel: attribution.acquisitionChannel,
            platform: attribution.platform,
          };
        },
        getSafeAnswerValue: ({ answerKey, answers }) =>
          options.safeAnswerKeys.has(answerKey) ? stringValue(answers, answerKey) : undefined,
      })
    : undefined;
  const server = createTrackingServerEffects<T>([
    ...(options.metaPixelId && options.metaConversionsAccessToken ? [createMetaConversionsEffect<T>(options.metaConversionsAccessToken)] : []),
    ...(postHog ? [postHog] : []),
  ]);
  if (!options.gtmContainerId && !server && !options.metaPixelId) return undefined;
  return ({ event }) => {
    const meta = options.metaPixelId ? {
      pixelId: options.metaPixelId,
      eventName: "LeadProgress",
      testEventCode: options.metaTestEventCode,
      userData: ({ answers }: { answers: Record<string, unknown> }) => ({
        ph: stringValue(answers, "phone_number"),
        fn: stringValue(answers, "first_name"),
        ln: stringValue(answers, "last_name"),
        st: stringValue(answers, options.stateAnswerKey),
      }),
    } : undefined;
    const context = { includeContext: options.includeContext };
    const effect = server ? { server } : {};
    return {
      ...(server ? { visitorId: { cookie: { maxAgeSeconds: options.trackingVisitorIdCookieMaxAgeSeconds } } } : {}),
      ...(postHog ? { sessionId: { cookie: { maxAgeSeconds: options.trackingSessionIdCookieMaxAgeSeconds } } } : {}),
      ...(options.gtmContainerId ? { googleTagManager: googleTagManager({ containerId: options.gtmContainerId, delivery: "partytown", proxy: "first_party" }) } : {}),
      events: [
        event.formView({ name: "instant_form_view", ...context, ...effect }),
        event.stepView({ name: "instant_form_step_view", includeStep: true, ...context, ...effect }),
        ...(postHog && server ? [
          event.postHogPageView({ name: "$pageview", includeStep: true, ...context, server }),
          event.postHogPageLeave({ name: "$pageleave", includeStep: true, ...context, server }),
        ] : []),
        event.stepAnswer({ name: "instant_form_step_answer", includeStep: true, ...(meta ? { meta } : {}), ...effect }),
        event.trustedFormSubstepView({ name: "instant_form_trusted_form_substep_view", includeStep: true, ...(meta ? { meta } : {}), ...effect }),
        event.validationError({ name: "instant_form_validation_error", includeStep: true }),
        event.submitAttempt({ name: "instant_form_submit_attempt", includeStep: true }),
        event.submitSuccess({ name: "instant_form_submit_success", ...context, ...effect }),
        event.submitError({ name: "instant_form_submit_error", includeStep: true }),
      ],
    };
  };
}

function stringValue(values: Record<string, unknown>, key: string): string | undefined {
  const value = values[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
