export type ClientGoogleTagManagerConfig = {
  containerId: string;
  dataLayerName: "dataLayer";
  delivery: "partytown";
  proxy: "first_party";
  scriptUrl: string;
  partytownLib: string;
  partytownScriptUrl: string;
  routeKey: string;
  formName: string;
  pageName: string;
  context: Readonly<Record<string, string>>;
};

export type ClientTrackingConfig = {
  googleTagManager?: ClientGoogleTagManagerConfig;
};

export type TrackingEventPayload = {
  event: string;
  [key: string]: unknown;
};

export function renderGoogleTagManagerHead(
  googleTagManager: ClientGoogleTagManagerConfig | undefined,
  initialEvents: readonly TrackingEventPayload[] = [],
): string {
  if (!googleTagManager) {
    return "";
  }

  const eventLines = initialEvents
    .map((eventPayload) => `      window.dataLayer.push(${serializeForScript(eventPayload)});`)
    .join("\n");

  return `    <script>
      window.dataLayer = window.dataLayer || [];
      window.partytown = {
        ...(window.partytown || {}),
        lib: ${serializeForScript(googleTagManager.partytownLib)},
        forward: Array.from(new Set([...(window.partytown?.forward || []), "dataLayer.push"])),
        resolveUrl(url) {
          try {
            const nextUrl = url instanceof URL ? url : new URL(String(url), window.location.href);
            if (isInstantFormGoogleTagUrl(nextUrl)) {
              return new URL("/_instant/google-tags/proxy?u=" + encodeURIComponent(nextUrl.toString()), window.location.origin);
            }
          } catch {}
          return url;
        },
      };
      function isInstantFormGoogleTagUrl(url) {
        return url.protocol === "https:" && [
          "www.googletagmanager.com",
          "www.google-analytics.com",
          "region1.google-analytics.com",
          "stats.g.doubleclick.net",
          "www.googleadservices.com",
        ].includes(url.hostname);
      }
${eventLines}
    </script>
    <script src="${escapeHtml(googleTagManager.partytownScriptUrl)}" data-partytown-runtime="true"></script>
    <script type="text/partytown" src="${escapeHtml(googleTagManager.scriptUrl)}"></script>
`;
}

export function createBaseTrackingPayload(googleTagManager: ClientGoogleTagManagerConfig): Omit<TrackingEventPayload, "event"> {
  return {
    route_key: googleTagManager.routeKey,
    form_name: googleTagManager.formName,
    page_name: googleTagManager.pageName,
    context: googleTagManager.context,
  };
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => {
    if (character === "<") {
      return "\\u003c";
    }

    if (character === ">") {
      return "\\u003e";
    }

    return "\\u0026";
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
