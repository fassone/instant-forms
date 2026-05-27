import type { TrackingServerEventInput } from "../../../platform/flow";
import type { AutoInsuranceContract } from "./contracts";

export function createMetaConversionsServerCallback(accessToken: string) {
  return async ({ event, cookies, request }: TrackingServerEventInput<AutoInsuranceContract>) => {
    if (!event.meta) {
      return;
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
  };
}

function removeUndefinedValues<TValue>(input: Record<string, TValue | undefined>): Record<string, TValue> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, TValue] => entry[1] !== undefined),
  );
}
