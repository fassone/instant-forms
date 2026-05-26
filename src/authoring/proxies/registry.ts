import { defineRequestProxyRegistry } from "../../platform/scripts/request-proxy-registry";

export const requestProxies = defineRequestProxyRegistry({
  trustedForm: {
    route: "/_instant/trustedform/proxy",
    allowedMethods: ["GET", "HEAD", "POST"],
    timeoutMs: 4_500,
    allow: [
      { protocol: "https:", hostname: "trustedform.com" },
      { protocol: "https:", hostnameSuffix: ".trustedform.com" },
    ],
    clientRewrite: { kind: "query_param", param: "u" },
  },
  googleTags: {
    route: "/_instant/google-tags/proxy",
    allowedMethods: ["GET", "HEAD", "POST"],
    timeoutMs: 4_500,
    allow: [
      { protocol: "https:", hostname: "www.googletagmanager.com" },
      { protocol: "https:", hostname: "www.google-analytics.com" },
      { protocol: "https:", hostname: "region1.google-analytics.com" },
      { protocol: "https:", hostname: "stats.g.doubleclick.net" },
      { protocol: "https:", hostname: "www.googleadservices.com" },
    ],
    clientRewrite: { kind: "query_param", param: "u" },
  },
  metaPixel: {
    route: "/_instant/meta/proxy",
    allowedMethods: ["GET", "HEAD", "POST"],
    timeoutMs: 4_500,
    allow: [
      { protocol: "https:", hostname: "connect.facebook.net" },
      { protocol: "https:", hostname: "www.facebook.com", pathPrefix: "/tr" },
    ],
    clientRewrite: { kind: "query_param", param: "u" },
    specialRoutes: [
      {
        route: "/_instant/meta/tr",
        upstreamOrigin: "https://www.facebook.com",
        upstreamPath: "/tr",
      },
    ],
  },
});
