import type { RequestProxyClientDefinition } from "../scripts";

export function renderRequestProxyClientRuntimeScript(
  definitions: readonly RequestProxyClientDefinition[],
): string {
  const definitionsJson = JSON.stringify(definitions).replace(/<\/script/giu, "<\\/script");

  return `
      window.__INSTANT_REQUEST_PROXIES__ = {
        ...(window.__INSTANT_REQUEST_PROXIES__ || {}),
        ...Object.fromEntries(${definitionsJson}.map((definition) => [definition.key, definition])),
      };
      window.__INSTANT_REQUEST_PROXY_RUNTIME__ = window.__INSTANT_REQUEST_PROXY_RUNTIME__ || {};
      window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ = window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || [];
      window.__INSTANT_REQUEST_PROXY_SHIMS__ = window.__INSTANT_REQUEST_PROXY_SHIMS__ || {};
      window.__INSTANT_GET_REQUEST_PROXY_DEFINITION__ = function(proxyKey) {
        return window.__INSTANT_REQUEST_PROXIES__?.[proxyKey];
      };
      window.__INSTANT_IS_REQUEST_PROXY_URL_ALLOWED__ = function(definition, url) {
        return (definition.allow || []).some((rule) => {
          if (url.protocol !== rule.protocol) {
            return false;
          }
          const hostname = url.hostname.toLowerCase();
          const matchesHost =
            (rule.hostname ? hostname === String(rule.hostname).toLowerCase() : false) ||
            (rule.hostnameSuffix ? hostname.endsWith(String(rule.hostnameSuffix).toLowerCase()) : false);
          if (!matchesHost) {
            return false;
          }
          return rule.pathPrefix ? url.pathname.startsWith(rule.pathPrefix) : true;
        });
      };
      window.__INSTANT_IS_ALREADY_REQUEST_PROXIED__ = function(definition, url) {
        if (url.origin !== window.location.origin) {
          return false;
        }
        if (url.pathname === definition.route) {
          return true;
        }
        return (definition.specialRoutes || []).some((specialRoute) =>
          url.pathname === specialRoute.route || url.pathname.startsWith(specialRoute.route + "/"),
        );
      };
      window.__INSTANT_REWRITE_REQUEST_PROXY_URL__ = function(value, proxyKeys) {
        let url;
        try {
          url = value instanceof URL ? value : new URL(String(value), window.location.href);
        } catch {
          return value;
        }

        for (const proxyKey of proxyKeys || []) {
          const definition = window.__INSTANT_GET_REQUEST_PROXY_DEFINITION__(proxyKey);
          if (!definition || window.__INSTANT_IS_ALREADY_REQUEST_PROXIED__(definition, url)) {
            continue;
          }
          if (!window.__INSTANT_IS_REQUEST_PROXY_URL_ALLOWED__(definition, url)) {
            continue;
          }
          const specialRoute = (definition.specialRoutes || []).find((candidate) => {
            const upstreamOrigin = new URL(candidate.upstreamOrigin);
            return url.origin === upstreamOrigin.origin && url.pathname.startsWith(candidate.upstreamPath);
          });
          if (specialRoute) {
            const suffix = url.pathname.slice(specialRoute.upstreamPath.length);
            return specialRoute.route + suffix + url.search + url.hash;
          }
          if (definition.clientRewrite?.kind === "query_param") {
            return definition.route + "?" + definition.clientRewrite.param + "=" + encodeURIComponent(url.toString());
          }
        }

        return value;
      };
      window.__INSTANT_READ_ORIGINAL_REQUEST_PROXY_URL__ = function(value, proxyKeys) {
        let url;
        try {
          url = value instanceof URL ? value : new URL(String(value), window.location.href);
        } catch {
          return value;
        }

        for (const proxyKey of proxyKeys || []) {
          const definition = window.__INSTANT_GET_REQUEST_PROXY_DEFINITION__(proxyKey);
          if (!definition || url.origin !== window.location.origin) {
            continue;
          }
          if (url.pathname === definition.route && definition.clientRewrite?.kind === "query_param") {
            const target = url.searchParams.get(definition.clientRewrite.param);
            if (!target) {
              continue;
            }
            try {
              const targetUrl = new URL(target);
              if (window.__INSTANT_IS_REQUEST_PROXY_URL_ALLOWED__(definition, targetUrl)) {
                return targetUrl.toString();
              }
            } catch {}
          }
          const specialRoute = (definition.specialRoutes || []).find((candidate) =>
            url.pathname === candidate.route || url.pathname.startsWith(candidate.route + "/"),
          );
          if (specialRoute) {
            const upstreamUrl = new URL(specialRoute.upstreamOrigin);
            upstreamUrl.pathname = specialRoute.upstreamPath + url.pathname.slice(specialRoute.route.length);
            upstreamUrl.search = url.search;
            upstreamUrl.hash = url.hash;
            if (window.__INSTANT_IS_REQUEST_PROXY_URL_ALLOWED__(definition, upstreamUrl)) {
              return upstreamUrl.toString();
            }
          }
        }

        return value;
      };
      window.__INSTANT_ADD_REQUEST_PROXY_KEYS__ = function(proxyKeys) {
        proxyKeys.forEach((proxyKey) => {
          if (!window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__.includes(proxyKey)) {
            window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__.push(proxyKey);
          }
        });
      };
      window.__INSTANT_CREATE_PARTYTOWN_RESOLVE_URL__ = function(proxyKeys) {
        const proxyDefinitions = Object.fromEntries(
          (proxyKeys || []).flatMap((proxyKey) => {
            const definition = window.__INSTANT_GET_REQUEST_PROXY_DEFINITION__(proxyKey);
            return definition ? [[proxyKey, definition]] : [];
          }),
        );
        const proxyDefinitionsJson = JSON.stringify(proxyDefinitions).replace(/</g, "\\\\u003c");
        const proxyKeysJson = JSON.stringify(proxyKeys || []);
        const pageOriginJson = JSON.stringify(window.location.origin);
        const pageHrefJson = JSON.stringify(window.location.href);
        return new Function("url", \`
          const proxyDefinitions = \${proxyDefinitionsJson};
          const proxyKeys = \${proxyKeysJson};
          const pageOrigin = \${pageOriginJson};
          const pageHref = \${pageHrefJson};
          function isRequestProxyUrlAllowed(definition, url) {
            return (definition.allow || []).some((rule) => {
              if (url.protocol !== rule.protocol) {
                return false;
              }
              const hostname = url.hostname.toLowerCase();
              const matchesHost =
                (rule.hostname ? hostname === String(rule.hostname).toLowerCase() : false) ||
                (rule.hostnameSuffix ? hostname.endsWith(String(rule.hostnameSuffix).toLowerCase()) : false);
              if (!matchesHost) {
                return false;
              }
              return rule.pathPrefix ? url.pathname.startsWith(rule.pathPrefix) : true;
            });
          }
          function isAlreadyRequestProxied(definition, url) {
            if (url.origin !== pageOrigin) {
              return false;
            }
            if (url.pathname === definition.route) {
              return true;
            }
            return (definition.specialRoutes || []).some((specialRoute) =>
              url.pathname === specialRoute.route || url.pathname.startsWith(specialRoute.route + "/"),
            );
          }
          function rewriteRequestProxyUrl(value) {
            let nextUrl;
            try {
              nextUrl = value instanceof URL ? value : new URL(String(value), pageHref);
            } catch {
              return { rewritten: false, value };
            }
            for (const proxyKey of proxyKeys || []) {
              const definition = proxyDefinitions[proxyKey];
              if (!definition || isAlreadyRequestProxied(definition, nextUrl) || !isRequestProxyUrlAllowed(definition, nextUrl)) {
                continue;
              }
              const specialRoute = (definition.specialRoutes || []).find((candidate) => {
                const upstreamOrigin = new URL(candidate.upstreamOrigin);
                return nextUrl.origin === upstreamOrigin.origin && nextUrl.pathname.startsWith(candidate.upstreamPath);
              });
              if (specialRoute) {
                const suffix = nextUrl.pathname.slice(specialRoute.upstreamPath.length);
                return { rewritten: true, value: specialRoute.route + suffix + nextUrl.search + nextUrl.hash };
              }
              if (definition.clientRewrite && definition.clientRewrite.kind === "query_param") {
                return {
                  rewritten: true,
                  value: definition.route + "?" + definition.clientRewrite.param + "=" + encodeURIComponent(nextUrl.toString()),
                };
              }
            }
            return { rewritten: false, value };
          }
          const result = rewriteRequestProxyUrl(url);
          return result.rewritten ? new URL(String(result.value), pageOrigin) : url;
        \`);
      };
      window.__INSTANT_INSTALL_REQUEST_PROXY_SHIM__ = function(shimKey, proxyKeys) {
        window.__INSTANT_ADD_REQUEST_PROXY_KEYS__(proxyKeys);
        if (window.__INSTANT_REQUEST_PROXY_SHIMS__[shimKey]) {
          return;
        }
        window.__INSTANT_REQUEST_PROXY_SHIMS__[shimKey] = true;
        if (window.__INSTANT_REQUEST_PROXY_RUNTIME__.patched) {
          return;
        }
        window.__INSTANT_REQUEST_PROXY_RUNTIME__.patched = true;
        const nativeFetch = window.fetch;
        if (typeof nativeFetch === "function") {
          window.fetch = function(input, init) {
            const activeProxyKeys = window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || [];
            if (input instanceof Request) {
              const rewrittenUrl = window.__INSTANT_REWRITE_REQUEST_PROXY_URL__(input.url, activeProxyKeys);
              if (rewrittenUrl !== input.url) {
                return nativeFetch.call(this, new Request(rewrittenUrl, input), init);
              }
              return nativeFetch.call(this, input, init);
            }
            return nativeFetch.call(this, window.__INSTANT_REWRITE_REQUEST_PROXY_URL__(input, activeProxyKeys), init);
          };
        }
        const nativeOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          return nativeOpen.call(
            this,
            method,
            window.__INSTANT_REWRITE_REQUEST_PROXY_URL__(url, window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || []),
            ...rest,
          );
        };
        if (typeof navigator.sendBeacon === "function") {
          const nativeSendBeacon = navigator.sendBeacon.bind(navigator);
          navigator.sendBeacon = function(url, data) {
            return nativeSendBeacon(
              window.__INSTANT_REWRITE_REQUEST_PROXY_URL__(url, window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || []),
              data,
            );
          };
        }
        patchInstantRequestProxySetAttribute();
        patchInstantRequestProxyGetAttribute();
        patchInstantRequestProxyUrlProperty(HTMLImageElement.prototype, "src");
        patchInstantRequestProxyUrlProperty(HTMLScriptElement.prototype, "src");
        patchInstantRequestProxyUrlProperty(HTMLIFrameElement.prototype, "src");
        patchInstantRequestProxyUrlProperty(HTMLLinkElement.prototype, "href");
        patchInstantRequestProxyUrlProperty(HTMLAnchorElement.prototype, "href");
        patchInstantRequestProxyHtmlStringWriter(document, "write");
        patchInstantRequestProxyHtmlStringWriter(document, "writeln");
        patchInstantRequestProxyInsertAdjacentHTML();
      };
      window.__INSTANT_COMPOSE_PARTYTOWN_CONFIG__ = function(existingPartytown, nextConfig) {
        const existing = existingPartytown || {};
        const requestProxyKeys = nextConfig.requestProxyKeys || [];
        window.__INSTANT_PARTYTOWN_REQUEST_PROXY_KEYS__ = window.__INSTANT_PARTYTOWN_REQUEST_PROXY_KEYS__ || [];
        requestProxyKeys.forEach((proxyKey) => {
          if (!window.__INSTANT_PARTYTOWN_REQUEST_PROXY_KEYS__.includes(proxyKey)) {
            window.__INSTANT_PARTYTOWN_REQUEST_PROXY_KEYS__.push(proxyKey);
          }
        });
        const forwardByKey = new Map();
        [...(existing.forward || []), ...(nextConfig.forward || [])].forEach((entry) => {
          forwardByKey.set(Array.isArray(entry) ? entry[0] : entry, entry);
        });
        return {
          ...existing,
          ...nextConfig,
          forward: Array.from(forwardByKey.values()),
          loadScriptsOnMainThread: [
            ...(existing.loadScriptsOnMainThread || []),
            ...(nextConfig.loadScriptsOnMainThread || []),
          ],
          resolveUrl: window.__INSTANT_CREATE_PARTYTOWN_RESOLVE_URL__(window.__INSTANT_PARTYTOWN_REQUEST_PROXY_KEYS__),
        };
      };
      function patchInstantRequestProxySetAttribute() {
        const nativeSetAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
          const attributeName = String(name).toLowerCase();
          if (attributeName === "src" || attributeName === "href") {
            return nativeSetAttribute.call(
              this,
              name,
              window.__INSTANT_REWRITE_REQUEST_PROXY_URL__(value, window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || []),
            );
          }
          return nativeSetAttribute.call(this, name, value);
        };
      }
      function patchInstantRequestProxyGetAttribute() {
        const nativeGetAttribute = Element.prototype.getAttribute;
        Element.prototype.getAttribute = function(name) {
          const value = nativeGetAttribute.call(this, name);
          if (value === null) {
            return value;
          }
          const attributeName = String(name).toLowerCase();
          return attributeName === "src" || attributeName === "href"
            ? window.__INSTANT_READ_ORIGINAL_REQUEST_PROXY_URL__(value, window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || [])
            : value;
        };
      }
      function patchInstantRequestProxyUrlProperty(prototype, propertyName) {
        if (!prototype) {
          return;
        }
        const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
        if (!descriptor || typeof descriptor.set !== "function" || typeof descriptor.get !== "function") {
          return;
        }
        Object.defineProperty(prototype, propertyName, {
          configurable: true,
          enumerable: descriptor.enumerable,
          get: function() {
            return window.__INSTANT_READ_ORIGINAL_REQUEST_PROXY_URL__(
              descriptor.get.call(this),
              window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || [],
            );
          },
          set: function(value) {
            return descriptor.set.call(
              this,
              window.__INSTANT_REWRITE_REQUEST_PROXY_URL__(value, window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || []),
            );
          },
        });
      }
      function patchInstantRequestProxyHtmlStringWriter(target, methodName) {
        const nativeMethod = target[methodName];
        if (typeof nativeMethod !== "function") {
          return;
        }
        target[methodName] = function(...values) {
          return nativeMethod.apply(this, values.map((value) => rewriteInstantRequestProxyHtml(String(value))));
        };
      }
      function patchInstantRequestProxyInsertAdjacentHTML() {
        const nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
        Element.prototype.insertAdjacentHTML = function(position, html) {
          return nativeInsertAdjacentHTML.call(this, position, rewriteInstantRequestProxyHtml(String(html)));
        };
      }
      function rewriteInstantRequestProxyHtml(html) {
        return html.replace(/https:\\/\\/[^"'<>\\s)]+/g, (url) =>
          String(window.__INSTANT_REWRITE_REQUEST_PROXY_URL__(url.replace(/&amp;/g, "&"), window.__INSTANT_ACTIVE_REQUEST_PROXY_KEYS__ || [])),
        );
      }`;
}
