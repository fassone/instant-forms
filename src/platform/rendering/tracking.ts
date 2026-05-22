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
      installGoogleTagRequestProxyShim();
      window.dataLayer = window.dataLayer || [];
      window.partytown = {
        ...(window.partytown || {}),
        lib: ${serializeForScript(googleTagManager.partytownLib)},
        forward: Array.from(new Set([...(window.partytown?.forward || []), "dataLayer.push"])),
        loadScriptsOnMainThread: [
          ...(window.partytown?.loadScriptsOnMainThread || []),
          "https://www.googletagmanager.com/debug/bootstrap",
          "https://www.google-analytics.com/debug/bootstrap",
          /\\/_instant\\/google-tags\\/proxy\\?u=https%3A%2F%2Fwww\\.googletagmanager\\.com%2Fdebug%2Fbootstrap/,
          /\\/_instant\\/google-tags\\/proxy\\?u=https%3A%2F%2Fwww\\.google-analytics\\.com%2Fdebug%2Fbootstrap/,
        ],
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
      function installGoogleTagRequestProxyShim() {
        if (window.__INSTANT_GOOGLE_TAG_PROXY_SHIM__) {
          return;
        }
        window.__INSTANT_GOOGLE_TAG_PROXY_SHIM__ = true;
        const nativeFetch = window.fetch;
        if (typeof nativeFetch === "function") {
          window.fetch = function(input, init) {
            if (input instanceof Request) {
              if (shouldProxyGoogleTagUrl(input.url)) {
                return nativeFetch.call(this, new Request(rewriteGoogleTagUrl(input.url), input), init);
              }
              return nativeFetch.call(this, input, init);
            }
            return nativeFetch.call(this, rewriteGoogleTagUrl(input), init);
          };
        }
        const nativeOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          return nativeOpen.call(this, method, rewriteGoogleTagUrl(url), ...rest);
        };
        if (typeof navigator.sendBeacon === "function") {
          const nativeSendBeacon = navigator.sendBeacon.bind(navigator);
          navigator.sendBeacon = function(url, data) {
            return nativeSendBeacon(rewriteGoogleTagUrl(url), data);
          };
        }
        patchGoogleTagSetAttribute();
        patchGoogleTagGetAttribute();
        patchGoogleTagUrlProperty(HTMLImageElement.prototype, "src");
        patchGoogleTagUrlProperty(HTMLScriptElement.prototype, "src");
        patchGoogleTagUrlProperty(HTMLIFrameElement.prototype, "src");
        patchGoogleTagUrlProperty(HTMLLinkElement.prototype, "href");
        patchGoogleTagUrlProperty(HTMLAnchorElement.prototype, "href");
        patchGoogleTagHtmlStringWriter(document, "write");
        patchGoogleTagHtmlStringWriter(document, "writeln");
        patchGoogleTagInsertAdjacentHTML();
      }
      function shouldProxyGoogleTagUrl(value) {
        try {
          const url = value instanceof URL ? value : new URL(String(value), window.location.href);
          return isInstantFormGoogleTagUrl(url) && !isInstantFormGoogleTagProxyUrl(url);
        } catch {
          return false;
        }
      }
      function rewriteGoogleTagUrl(value) {
        if (!shouldProxyGoogleTagUrl(value)) {
          return value;
        }
        const url = value instanceof URL ? value : new URL(String(value), window.location.href);
        return "/_instant/google-tags/proxy?u=" + encodeURIComponent(url.toString());
      }
      function readOriginalGoogleTagUrl(value) {
        try {
          const url = value instanceof URL ? value : new URL(String(value), window.location.href);
          if (!isInstantFormGoogleTagProxyUrl(url)) {
            return value;
          }
          const target = url.searchParams.get("u");
          if (!target) {
            return value;
          }
          const targetUrl = new URL(target);
          return isInstantFormGoogleTagUrl(targetUrl) ? targetUrl.toString() : value;
        } catch {
          return value;
        }
      }
      function isInstantFormGoogleTagProxyUrl(url) {
        return url.origin === window.location.origin && url.pathname === "/_instant/google-tags/proxy";
      }
      function patchGoogleTagSetAttribute() {
        const nativeSetAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
          const attributeName = String(name).toLowerCase();
          if (attributeName === "src" || attributeName === "href") {
            return nativeSetAttribute.call(this, name, rewriteGoogleTagUrl(value));
          }
          return nativeSetAttribute.call(this, name, value);
        };
      }
      function patchGoogleTagGetAttribute() {
        const nativeGetAttribute = Element.prototype.getAttribute;
        Element.prototype.getAttribute = function(name) {
          const value = nativeGetAttribute.call(this, name);
          if (value === null) {
            return value;
          }
          const attributeName = String(name).toLowerCase();
          return attributeName === "src" || attributeName === "href" ? readOriginalGoogleTagUrl(value) : value;
        };
      }
      function patchGoogleTagUrlProperty(prototype, propertyName) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
        if (!descriptor || typeof descriptor.set !== "function" || typeof descriptor.get !== "function") {
          return;
        }
        Object.defineProperty(prototype, propertyName, {
          configurable: true,
          enumerable: descriptor.enumerable,
          get: function() {
            return readOriginalGoogleTagUrl(descriptor.get.call(this));
          },
          set: function(value) {
            return descriptor.set.call(this, rewriteGoogleTagUrl(value));
          },
        });
      }
      function patchGoogleTagHtmlStringWriter(target, methodName) {
        const nativeMethod = target[methodName];
        target[methodName] = function(...values) {
          return nativeMethod.apply(this, values.map((value) => rewriteGoogleTagHtml(String(value))));
        };
      }
      function patchGoogleTagInsertAdjacentHTML() {
        const nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
        Element.prototype.insertAdjacentHTML = function(position, html) {
          return nativeInsertAdjacentHTML.call(this, position, rewriteGoogleTagHtml(String(html)));
        };
      }
      function rewriteGoogleTagHtml(html) {
        return html.replace(
          /https:\\/\\/(?:www\\.googletagmanager\\.com|www\\.google-analytics\\.com|region1\\.google-analytics\\.com|stats\\.g\\.doubleclick\\.net|www\\.googleadservices\\.com)[^"'<>\\s)]*/g,
          (url) => String(rewriteGoogleTagUrl(url.replace(/&amp;/g, "&"))),
        );
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
