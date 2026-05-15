import { defineScriptProxyRegistry } from "../../platform/scripts";

export const selectedScripts = defineScriptProxyRegistry({
  tfc: {
    upstreamUrl: "https://api.trustedform.com/trustedform.js",
    allowedQueryParams: ["field", "use_tagged_consent", "sandbox"],
    queryAliases: {
      f: "field",
      t: "use_tagged_consent",
      s: "sandbox",
    },
  },
});
