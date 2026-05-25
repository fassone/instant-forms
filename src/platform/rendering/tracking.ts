import { createHash } from "node:crypto";

import type {
  FormStep,
  InstantForm,
  TrackingEventConfig,
  TrackingEventKind,
} from "../flow";
import type { SubmissionPayload } from "../submissions/validation";
import { getPartytownBootstrapSource } from "../scripts/partytown-bootstrap";

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
  events: Readonly<Record<string, ClientTrackingEventConfig>>;
  metaPixelProxy: boolean;
};

export type ClientTrackingConfig = {
  googleTagManager?: ClientGoogleTagManagerConfig;
};

export type ClientTrackingEventConfig = {
  name: string;
  includeContext?: readonly string[];
  includeStep: boolean;
  meta?: {
    pixelId: string;
    eventName: string;
  };
};

export type TrackingEventPayload = {
  event: string;
  [key: string]: unknown;
};

export type MetaBrowserIds = {
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  eventSourceUrl?: string;
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
      if (${serializeForScript(googleTagManager.metaPixelProxy)}) {
        installMetaPixelRequestProxyShim();
      }
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
            if (${serializeForScript(googleTagManager.metaPixelProxy)} && isInstantFormMetaPixelUrl(nextUrl)) {
              return new URL("/_instant/meta/proxy?u=" + encodeURIComponent(nextUrl.toString()), window.location.origin);
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
      function isInstantFormMetaPixelUrl(url) {
        return url.protocol === "https:" && (
          url.hostname === "connect.facebook.net" ||
          (url.hostname === "www.facebook.com" && url.pathname.startsWith("/tr"))
        );
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
      function installMetaPixelRequestProxyShim() {
        if (window.__INSTANT_META_PIXEL_PROXY_SHIM__) {
          return;
        }
        window.__INSTANT_META_PIXEL_PROXY_SHIM__ = true;
        const nativeFetch = window.fetch;
        if (typeof nativeFetch === "function") {
          window.fetch = function(input, init) {
            if (input instanceof Request) {
              if (shouldProxyMetaPixelUrl(input.url)) {
                return nativeFetch.call(this, new Request(rewriteMetaPixelUrl(input.url), input), init);
              }
              return nativeFetch.call(this, input, init);
            }
            return nativeFetch.call(this, rewriteMetaPixelUrl(input), init);
          };
        }
        const nativeOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          return nativeOpen.call(this, method, rewriteMetaPixelUrl(url), ...rest);
        };
        if (typeof navigator.sendBeacon === "function") {
          const nativeSendBeacon = navigator.sendBeacon.bind(navigator);
          navigator.sendBeacon = function(url, data) {
            return nativeSendBeacon(rewriteMetaPixelUrl(url), data);
          };
        }
        patchMetaPixelSetAttribute();
        patchMetaPixelUrlProperty(HTMLImageElement.prototype, "src");
        patchMetaPixelUrlProperty(HTMLScriptElement.prototype, "src");
        patchMetaPixelUrlProperty(HTMLIFrameElement.prototype, "src");
        patchMetaPixelHtmlStringWriter(document, "write");
        patchMetaPixelHtmlStringWriter(document, "writeln");
        patchMetaPixelInsertAdjacentHTML();
      }
      function shouldProxyMetaPixelUrl(value) {
        try {
          const url = value instanceof URL ? value : new URL(String(value), window.location.href);
          return isInstantFormMetaPixelUrl(url) && !isInstantFormMetaPixelProxyUrl(url);
        } catch {
          return false;
        }
      }
      function rewriteMetaPixelUrl(value) {
        if (!shouldProxyMetaPixelUrl(value)) {
          return value;
        }
        const url = value instanceof URL ? value : new URL(String(value), window.location.href);
        return "/_instant/meta/proxy?u=" + encodeURIComponent(url.toString());
      }
      function isInstantFormMetaPixelProxyUrl(url) {
        return url.origin === window.location.origin && url.pathname === "/_instant/meta/proxy";
      }
      function patchMetaPixelSetAttribute() {
        const nativeSetAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
          if (String(name).toLowerCase() === "src") {
            return nativeSetAttribute.call(this, name, rewriteMetaPixelUrl(value));
          }
          return nativeSetAttribute.call(this, name, value);
        };
      }
      function patchMetaPixelUrlProperty(prototype, propertyName) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
        if (!descriptor || typeof descriptor.set !== "function") {
          return;
        }
        Object.defineProperty(prototype, propertyName, {
          configurable: true,
          enumerable: descriptor.enumerable,
          get: descriptor.get,
          set: function(value) {
            return descriptor.set.call(this, rewriteMetaPixelUrl(value));
          },
        });
      }
      function patchMetaPixelHtmlStringWriter(target, methodName) {
        const nativeMethod = target[methodName];
        target[methodName] = function(...values) {
          return nativeMethod.apply(this, values.map((value) => rewriteMetaPixelHtml(String(value))));
        };
      }
      function patchMetaPixelInsertAdjacentHTML() {
        const nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
        Element.prototype.insertAdjacentHTML = function(position, html) {
          return nativeInsertAdjacentHTML.call(this, position, rewriteMetaPixelHtml(String(html)));
        };
      }
      function rewriteMetaPixelHtml(html) {
        return html.replace(
          /https:\\/\\/(?:connect\\.facebook\\.net|www\\.facebook\\.com\\/tr)[^"'<>\\s)]*/g,
          (url) => String(rewriteMetaPixelUrl(url.replace(/&amp;/g, "&"))),
        );
      }
${eventLines}
    </script>
    <script data-partytown-runtime="true">${escapeInlineScript(getPartytownBootstrapSource())}</script>
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

export function createLifecycleTrackingPayload(input: {
  form: InstantForm;
  routeKey: string;
  kind: TrackingEventKind;
  step?: FormStep;
  stepIndex?: number;
  extra?: Record<string, unknown>;
  answers?: Record<string, string | undefined>;
  submission?: SubmissionPayload;
  browserIds?: MetaBrowserIds;
  eventId?: string;
  eventSourceUrl?: string;
  requireMeta?: boolean;
}): TrackingEventPayload | undefined {
  const eventConfig = getTrackingEventConfig(input.form, input.kind, input.step);
  if (!eventConfig || (input.requireMeta && !eventConfig.meta)) {
    return undefined;
  }

  return buildTrackingPayload(input.form, input.routeKey, eventConfig, {
    step: input.step,
    stepIndex: input.stepIndex,
    extra: input.extra,
    answers: input.answers,
    submission: input.submission,
    browserIds: input.browserIds,
    eventId: input.eventId,
    eventSourceUrl: input.eventSourceUrl,
  });
}

export function createLifecycleTrackingPayloads(
  items: readonly Parameters<typeof createLifecycleTrackingPayload>[0][],
): TrackingEventPayload[] {
  return items.flatMap((item) => {
    const payload = createLifecycleTrackingPayload(item);
    return payload ? [payload] : [];
  });
}

function getTrackingEventConfig(
  form: InstantForm,
  kind: TrackingEventKind,
  step: FormStep | undefined,
): TrackingEventConfig | undefined {
  const globalEvent = form.tracking?.events?.find((eventConfig) => eventConfig.kind === kind);
  const stepOverride = step?.tracking?.[kind as keyof NonNullable<FormStep["tracking"]>];
  if (stepOverride === false) {
    return undefined;
  }

  if (stepOverride) {
    return {
      ...(globalEvent ?? { kind, name: "", includeStep: false }),
      ...stepOverride,
    };
  }

  return globalEvent;
}

function buildTrackingPayload(
  form: InstantForm,
  routeKey: string,
  eventConfig: TrackingEventConfig,
  options: {
    step?: FormStep;
    stepIndex?: number;
    extra?: Record<string, unknown>;
    answers?: Record<string, string | undefined>;
    submission?: SubmissionPayload;
    browserIds?: MetaBrowserIds;
    eventId?: string;
    eventSourceUrl?: string;
  },
): TrackingEventPayload {
  return {
    event: eventConfig.name,
    route_key: routeKey,
    form_name: form.name,
    page_name: form.page.name,
    ...getIncludedContextPayload(form, eventConfig.includeContext),
    ...(eventConfig.includeStep ? getStepTrackingPayload(options.step, options.stepIndex) : {}),
    ...(options.extra ?? {}),
    ...(eventConfig.meta
      ? {
          meta: createMetaPayload(form, eventConfig, {
            step: options.step,
            stepIndex: options.stepIndex,
            answers: options.answers,
            submission: options.submission,
            browserIds: options.browserIds,
            eventId: options.eventId,
            eventSourceUrl: options.eventSourceUrl,
          }),
        }
      : {}),
  };
}

function getIncludedContextPayload(
  form: InstantForm,
  includeContext: readonly string[] | undefined,
): { context?: Record<string, string> } {
  if (!includeContext || includeContext.length === 0) {
    return {};
  }

  const context = Object.fromEntries(
    includeContext.flatMap((key) => {
      const value = form.context[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );

  return Object.keys(context).length > 0 ? { context } : {};
}

function getStepTrackingPayload(
  step: FormStep | undefined,
  stepIndex: number | undefined,
): Record<string, string | number> {
  if (!step) {
    return {};
  }

  return {
    step_key: step.key,
    step_slug: step.slug,
    ...(typeof stepIndex === "number" ? { step_index: stepIndex } : {}),
    step_kind: step.kind,
  };
}

function createMetaPayload(
  form: InstantForm,
  eventConfig: TrackingEventConfig,
  options: {
    step?: FormStep;
    stepIndex?: number;
    answers?: Record<string, string | undefined>;
    submission?: SubmissionPayload;
    browserIds?: MetaBrowserIds;
    eventId?: string;
    eventSourceUrl?: string;
  },
): Record<string, unknown> | undefined {
  const meta = eventConfig.meta;
  if (!meta) {
    return undefined;
  }

  const eventId = options.eventId ?? options.submission?.submissionId ?? crypto.randomUUID();
  const answers = options.submission?.answers ?? options.answers ?? {};
  const step = options.step
    ? {
        key: options.step.key,
        slug: options.step.slug,
        kind: options.step.kind,
        ...(typeof options.stepIndex === "number" ? { index: options.stepIndex } : {}),
      }
    : undefined;
  const input = {
    context: form.context,
    answers,
    submission: { id: options.submission?.submissionId ?? eventId },
    event: { id: eventId, kind: eventConfig.kind },
    ...(step ? { step } : {}),
  };
  const rawUserData = meta.userData?.(input) ?? {};
  const customData = meta.customData?.(input) ?? {};
  const resolvedEventId = meta.eventId?.(input) ?? eventId;

  return {
    pixel_id: meta.pixelId,
    event_name: meta.eventName,
    event_id: resolvedEventId,
    action_source: "website",
    event_source_url: options.eventSourceUrl,
    user_data: hashMetaUserData(rawUserData),
    custom_data: removeUndefinedValues(customData),
    ...removeUndefinedValues({
      fbp: options.browserIds?.fbp,
      fbc: options.browserIds?.fbc,
      fbclid: options.browserIds?.fbclid,
    }),
  };
}

function hashMetaUserData(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      const normalized = normalizeMetaUserDataValue(key, value);
      return normalized ? [[key, sha256Hex(normalized)]] : [];
    }),
  );
}

function normalizeMetaUserDataValue(key: string, value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }

  if (key === "ph") {
    const digits = trimmed.replace(/\D/g, "");
    return digits || undefined;
  }

  return trimmed.toLowerCase();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function removeUndefinedValues<TValue>(input: Record<string, TValue | undefined>): Record<string, TValue> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, TValue] => entry[1] !== undefined),
  );
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

function escapeInlineScript(value: string): string {
  return value.replace(/<\/script/giu, "<\\/script");
}
