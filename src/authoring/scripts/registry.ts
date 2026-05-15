import { defineScriptProxyRegistry } from "../../platform/scripts";

export const selectedScripts = defineScriptProxyRegistry({
  tfc: {
    upstreamUrl: "https://api.trustedform.com/trustedform.js",
    fetchRuntime: "node",
    allowedQueryParams: ["field", "use_tagged_consent", "sandbox"],
    queryAliases: {
      f: "field",
      t: "use_tagged_consent",
      s: "sandbox",
    },
    responseReplacements: [
      {
        search: "https://cdn.trustedform.com/trustedform-1.11.7.js",
        replace: "/_instant/scripts/trustedform.com/tfc-core.js",
      },
    ],
  },
  "tfc-core": {
    upstreamUrl: "https://cdn.trustedform.com/trustedform-1.11.7.js",
    fetchRuntime: "node",
    allowedQueryParams: [],
  },
});
