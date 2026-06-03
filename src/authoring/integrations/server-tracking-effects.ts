import type { FormContract, TrackingServerEventInput } from "../../platform/flow";
import { logInstantFormEvent } from "../../platform/logging";

export type TrackingServerEffectResult = {
  status?: number;
  skipped?: boolean;
};

export type TrackingServerEffect<TContract extends FormContract = FormContract> = {
  destination: string;
  run: (input: TrackingServerEventInput<TContract>) => void | TrackingServerEffectResult | Promise<void | TrackingServerEffectResult>;
};

export type TrackingServerEffectCallback<TContract extends FormContract = FormContract> = (
  input: TrackingServerEventInput<TContract>,
) => Promise<void>;

export function createTrackingServerEffects<TContract extends FormContract>(
  effects: readonly TrackingServerEffect<TContract>[],
): TrackingServerEffectCallback<TContract> | undefined {
  if (effects.length === 0) {
    return undefined;
  }

  return async (input) => {
    const results = await Promise.allSettled(
      effects.map(async (effect) => {
        const startedAt = Date.now();

        try {
          const result = await effect.run(input);
          if (result?.skipped) {
            return;
          }

          logTrackingEffect(input, {
            level: "info",
            event: "tracking.effect_succeeded",
            destination: effect.destination,
            durationMs: Date.now() - startedAt,
            status: result?.status,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logTrackingEffect(input, {
            level: "warn",
            event: "tracking.effect_failed",
            destination: effect.destination,
            durationMs: Date.now() - startedAt,
            data: { message },
          });
          throw error;
        }
      }),
    );

    const failedCount = results.filter((result) => result.status === "rejected").length;
    if (failedCount > 0) {
      throw new Error(`${failedCount} tracking server effect${failedCount === 1 ? "" : "s"} failed.`);
    }
  };
}

export function createMetaConversionsEffect<TContract extends FormContract>(accessToken: string): TrackingServerEffect<TContract> {
  return {
    destination: "meta",
    run: async ({ event, cookies, request }) => {
      if (!event.meta) {
        return { skipped: true };
      }

      const response = await fetch(
        `https://graph.facebook.com/v24.0/${encodeURIComponent(event.meta.pixel_id)}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: accessToken,
            data: [
              {
                event_name: event.meta.event_name,
                event_time: Math.floor(Date.now() / 1000),
                event_id: event.meta.event_id,
                action_source: event.meta.action_source,
                event_source_url: event.meta.event_source_url ?? request.url,
                user_data: removeUndefinedValues({
                  ...event.meta.user_data,
                  fbp: cookies.get("_fbp") ?? event.meta.fbp,
                  fbc: cookies.get("_fbc") ?? event.meta.fbc,
                  client_ip_address: request.ip,
                  client_user_agent: request.userAgent,
                }),
                custom_data: event.meta.custom_data,
              },
            ],
            ...(event.meta.test_event_code ? { test_event_code: event.meta.test_event_code } : {}),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Meta Conversions API request failed with status ${response.status}.`);
      }

      return { status: response.status };
    },
  };
}

export type PostHogCaptureEffectInput<TContract extends FormContract = FormContract> = {
  projectApiKey: string;
  apiHost: string;
  getProperties?: (input: TrackingServerEventInput<TContract>) => Record<string, string | number | boolean | undefined>;
};

export function createPostHogCaptureEffect<TContract extends FormContract>({
  projectApiKey,
  apiHost,
  getProperties,
}: PostHogCaptureEffectInput<TContract>): TrackingServerEffect<TContract> {
  const captureUrl = new URL("/i/v0/e/", apiHost);

  return {
    destination: "posthog",
    run: async (input) => {
      const distinctId = input.visitor?.id;
      if (!distinctId) {
        throw new Error("PostHog visitor id is unavailable.");
      }

      const response = await fetch(captureUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: projectApiKey,
          event: input.event.event,
          distinct_id: distinctId,
          timestamp: new Date().toISOString(),
          properties: removeUndefinedValues({
            ...createSafePostHogProperties(input),
            ...(getProperties?.(input) ?? {}),
            $process_person_profile: false,
          }),
        }),
      });

      if (!response.ok) {
        throw new Error(`PostHog capture request failed with status ${response.status}.`);
      }

      return { status: response.status };
    },
  };
}

function createSafePostHogProperties(input: TrackingServerEventInput): Record<string, string | number | boolean | undefined> {
  return {
    event_id: input.event.id,
    route_key: getStringProperty(input.event.route_key),
    form_name: getStringProperty(input.event.form_name),
    page_name: getStringProperty(input.event.page_name),
    context: input.event.context ? JSON.stringify(input.event.context) : undefined,
    step_key: getStringProperty(input.event.step_key) ?? input.step?.key,
    step_slug: getStringProperty(input.event.step_slug) ?? input.step?.slug,
    step_index: getNumberProperty(input.event.step_index) ?? input.step?.index,
    step_kind: getStringProperty(input.event.step_kind) ?? input.step?.kind,
    trusted_form_substep: getStringProperty(input.event.trusted_form_substep),
    submission_id: input.submission?.id,
    $current_url: getStringProperty(input.event.event_source_url) ?? input.request.url,
    $ip: input.request.ip,
    $user_agent: input.request.userAgent,
  };
}

function logTrackingEffect(
  input: TrackingServerEventInput,
  record: {
    level: "info" | "warn";
    event: "tracking.effect_succeeded" | "tracking.effect_failed";
    destination: string;
    durationMs: number;
    status?: number;
    data?: Record<string, unknown>;
  },
): void {
  logInstantFormEvent(input.runtime?.logger, {
    level: record.level,
    event: record.event,
    requestId: input.runtime?.requestId,
    routeKey: input.runtime?.routeKey,
    formName: input.runtime?.formName,
    pageName: input.runtime?.pageName,
    stepKey: input.runtime?.stepKey,
    submissionId: input.runtime?.submissionId,
    status: record.status,
    durationMs: record.durationMs,
    data: {
      destination: record.destination,
      trackingEvent: input.event.event,
      trackingEventId: input.event.id,
      ...(record.data ?? {}),
    },
  });
}

function removeUndefinedValues<TValue>(input: Record<string, TValue | undefined>): Record<string, TValue> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, TValue] => entry[1] !== undefined),
  );
}

function getStringProperty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNumberProperty(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
