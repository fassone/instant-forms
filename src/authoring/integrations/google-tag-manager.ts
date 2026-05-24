import { z, type GoogleTagManagerConfig, type GoogleTagManagerContainerId } from "../../platform/flow";

export const gtmContainerIdSchema = z.custom<GoogleTagManagerContainerId>(
  (value) => typeof value === "string" && /^GTM-[A-Z0-9]+$/iu.test(value),
  { message: "Expected a Google Tag Manager container ID like GTM-XXXX." },
);

export const metaPixelIdSchema = z.string().regex(/^\d{5,30}$/u, {
  message: "Expected a numeric Meta Pixel ID.",
});

export type GoogleTagManagerOverrides<TContextKey extends string = string> = {
  containerId: GoogleTagManagerContainerId;
  delivery?: "partytown";
  proxy?: "first_party";
};

export function googleTagManager<const TContextKey extends string>(
  overrides: GoogleTagManagerOverrides<TContextKey>,
): GoogleTagManagerConfig<TContextKey> {
  assertGtmContainerId(overrides.containerId);

  return {
    containerId: overrides.containerId,
    delivery: overrides.delivery ?? "partytown",
    proxy: overrides.proxy ?? "first_party",
    dataLayerName: "dataLayer",
    scriptProxyKey: "gtm",
    scriptBaseUrl: "/_instant/scripts/gtm.js",
    partytownLib: "/~partytown/",
    partytownScriptUrl: "/~partytown/partytown.js",
  };
}

function assertGtmContainerId(containerId: GoogleTagManagerContainerId): void {
  if (!/^GTM-[A-Z0-9]+$/iu.test(containerId)) {
    throw new Error("Expected a Google Tag Manager container ID like GTM-XXXX.");
  }
}
