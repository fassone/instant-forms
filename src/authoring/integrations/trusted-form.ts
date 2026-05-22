import type { TrustedFormConsentConfig } from "../../platform/flow";

export type TrustedFormCertifyOverrides = Partial<
  Pick<TrustedFormConsentConfig, "allowSubmitWithoutCert" | "delivery">
>;

export function trustedFormCertify(
  overrides: TrustedFormCertifyOverrides = {},
): Partial<TrustedFormConsentConfig> {
  return {
    fieldName: "xxTrustedFormCertUrl",
    delivery: overrides.delivery ?? "main_thread",
    scriptProxyKey: "tfc",
    scriptBaseUrl: "/_instant/scripts/trustedform.com/tfc.js",
    preloadAssets: "when_reachable",
    execute: "on_step_mount",
    requireReadyBefore: "consent_substep",
    allowSubmitWithoutCert: overrides.allowSubmitWithoutCert ?? true,
  };
}
