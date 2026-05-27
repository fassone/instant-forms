import type { FormAttribution, FormPayloadCookieHelpers } from "../../../platform/flow";

const LEAD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const LEAD_ATTRIBUTION_VALUE_MAX_LENGTH = 100;

const leadAttributionCookies = {
  acquisitionChannel: "liderna_acquisition_channel",
  platform: "liderna_platform",
  sourceChannel: "liderna_source_channel",
} as const;

export type LeadAttribution = {
  acquisitionChannel: "paid" | "organic";
  sourceChannel: string;
  platform?: string;
};

export function createLeadAttribution(): FormAttribution {
  return {
    preserveQueryParams: ["fbclid", "source_channel", "acquisition_channel", "platform"],
    capture: ({ url, now, cookies }) => {
      const fbclid = url.searchParams.get("fbclid")?.trim();

      if (fbclid && fbclid.length <= 500 && getFbcClickId(cookies.get("_fbc")) !== fbclid) {
        cookies.set("_fbc", `fb.1.${now.getTime()}.${fbclid}`, {
          path: "/",
          maxAge: LEAD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
          sameSite: "Lax",
          httpOnly: false,
        });
      }

      const sourceChannel = sanitizeLeadAttributionValue(url.searchParams.get("source_channel"));
      if (sourceChannel) {
        cookies.set(leadAttributionCookies.sourceChannel, sourceChannel, {
          path: "/",
          maxAge: LEAD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
          sameSite: "Lax",
          httpOnly: false,
        });
      }

      const acquisitionChannel = normalizeAcquisitionChannel(url.searchParams.get("acquisition_channel"));
      if (acquisitionChannel) {
        cookies.set(leadAttributionCookies.acquisitionChannel, acquisitionChannel, {
          path: "/",
          maxAge: LEAD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
          sameSite: "Lax",
          httpOnly: false,
        });
      }

      const platform = sanitizeLeadAttributionValue(url.searchParams.get("platform"));
      if (platform) {
        cookies.set(leadAttributionCookies.platform, platform, {
          path: "/",
          maxAge: LEAD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
          sameSite: "Lax",
          httpOnly: false,
        });
      }
    },
  };
}

export function getCapturedLeadAttribution(cookies: FormPayloadCookieHelpers): LeadAttribution {
  const sourceChannel = sanitizeLeadAttributionValue(cookies.get(leadAttributionCookies.sourceChannel)) ?? "unknown";
  const acquisitionChannel = normalizeAcquisitionChannel(cookies.get(leadAttributionCookies.acquisitionChannel)) ?? "organic";
  const platform = sanitizeLeadAttributionValue(cookies.get(leadAttributionCookies.platform));

  return {
    acquisitionChannel,
    sourceChannel,
    ...(platform ? { platform } : {}),
  };
}

export function getFbcClickId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const lastSeparatorIndex = value.lastIndexOf(".");

  return lastSeparatorIndex === -1 ? undefined : value.slice(lastSeparatorIndex + 1);
}

function normalizeAcquisitionChannel(value: string | null | undefined): "paid" | "organic" | undefined {
  const normalizedValue = value?.trim().toLowerCase();

  return normalizedValue === "paid" || normalizedValue === "organic" ? normalizedValue : undefined;
}

function sanitizeLeadAttributionValue(value: string | null | undefined): string | undefined {
  const normalizedValue = value?.trim();
  if (!normalizedValue || normalizedValue.length > LEAD_ATTRIBUTION_VALUE_MAX_LENGTH) {
    return undefined;
  }

  return /^[\x21-\x7E]+$/u.test(normalizedValue) && !/[",;\\]/u.test(normalizedValue)
    ? normalizedValue
    : undefined;
}
