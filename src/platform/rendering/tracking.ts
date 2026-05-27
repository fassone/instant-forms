import { createHash } from "node:crypto";

import type {
  FormStep,
  InstantForm,
  TrackingEventConfig,
  TrackingEventKind,
} from "../flow";
import type { SubmissionPayload } from "../submissions/validation";
import { requestProxies } from "../../authoring/proxies/registry";
import { getPartytownBootstrapSource } from "../scripts/partytown-bootstrap";
import { getRequestProxyClientDefinitions } from "../scripts/request-proxy-registry";
import { renderRequestProxyClientRuntimeScript } from "./request-proxy-client";

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
  server?: boolean;
  meta?: {
    pixelId: string;
    eventName: string;
  };
};

export type TrackingMetaPayload = {
  pixel_id: string;
  event_name: string;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: Record<string, string>;
  custom_data: Record<string, string | number | boolean>;
  test_event_code?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  [key: string]: unknown;
};

export type TrackingEventPayload = {
  event: string;
  id?: string;
  meta?: TrackingMetaPayload;
  [key: string]: unknown;
};

export type LifecycleTrackingEvent = {
  config: TrackingEventConfig;
  payload: TrackingEventPayload & { id: string };
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

  const initialEventsJson = serializeForScript(initialEvents);
  const requestProxyRuntimeScript = renderRequestProxyClientRuntimeScript(
    getRequestProxyClientDefinitions(requestProxies, ["googleTags", "metaPixel", "trustedForm"]),
  );
  const partytownRequestProxyKeys = serializeForScript(["googleTags", "metaPixel", "trustedForm"]);

  return `    <script>
${requestProxyRuntimeScript}
      installGoogleTagRequestProxyShim();
      if (${serializeForScript(googleTagManager.metaPixelProxy)}) {
        installMetaPixelRequestProxyShim();
      }
      window.dataLayer = window.dataLayer || [];
      window.__INSTANT_INITIAL_TRACKING_EVENTS__ = ${initialEventsJson};
      window.__INSTANT_INITIAL_TRACKING_EVENTS_PUSHED__ = false;
      function pushInstantInitialTrackingEvents() {
        if (window.__INSTANT_INITIAL_TRACKING_EVENTS_PUSHED__) {
          return;
        }
        window.__INSTANT_INITIAL_TRACKING_EVENTS_PUSHED__ = true;
        (window.__INSTANT_INITIAL_TRACKING_EVENTS__ || []).forEach((eventPayload) => {
          window.dataLayer.push(eventPayload);
        });
      }
      document.addEventListener("pt0", pushInstantInitialTrackingEvents, { once: true });
      window.setTimeout(pushInstantInitialTrackingEvents, 1500);
      window.partytown = window.__INSTANT_COMPOSE_PARTYTOWN_CONFIG__(window.partytown || {}, {
        lib: ${serializeForScript(googleTagManager.partytownLib)},
        forward: [
          ["dataLayer.push", { preserveBehavior: true }],
        ],
        loadScriptsOnMainThread: [
          "https://www.googletagmanager.com/debug/bootstrap",
          "https://www.google-analytics.com/debug/bootstrap",
          /\\/_instant\\/google-tags\\/proxy\\?u=https%3A%2F%2Fwww\\.googletagmanager\\.com%2Fdebug%2Fbootstrap/,
          /\\/_instant\\/google-tags\\/proxy\\?u=https%3A%2F%2Fwww\\.google-analytics\\.com%2Fdebug%2Fbootstrap/,
        ],
        requestProxyKeys: ${partytownRequestProxyKeys},
      });
      function installGoogleTagRequestProxyShim() {
        if (window.__INSTANT_GOOGLE_TAG_PROXY_SHIM__) {
          return;
        }
        window.__INSTANT_GOOGLE_TAG_PROXY_SHIM__ = true;
        window.__INSTANT_INSTALL_REQUEST_PROXY_SHIM__("googleTags", ["googleTags"]);
      }
      function installMetaPixelRequestProxyShim() {
        if (window.__INSTANT_META_PIXEL_PROXY_SHIM__) {
          return;
        }
        window.__INSTANT_META_PIXEL_PROXY_SHIM__ = true;
        window.__INSTANT_INSTALL_REQUEST_PROXY_SHIM__("metaPixel", ["metaPixel"]);
      }
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
  requireServerBuilt?: boolean;
}): TrackingEventPayload | undefined {
  return createLifecycleTrackingEvent(input)?.payload;
}

export function createLifecycleTrackingEvent(input: {
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
  requireServerBuilt?: boolean;
}): LifecycleTrackingEvent | undefined {
  const eventConfig = getTrackingEventConfig(input.form, input.kind, input.step);
  if (!eventConfig || (input.requireMeta && !eventConfig.meta)) {
    return undefined;
  }
  if (input.requireServerBuilt && !isServerBuiltTrackingEventConfig(eventConfig)) {
    return undefined;
  }

  return {
    config: eventConfig,
    payload: buildTrackingPayload(input.form, input.routeKey, eventConfig, {
      step: input.step,
      stepIndex: input.stepIndex,
      extra: input.extra,
      answers: input.answers,
      submission: input.submission,
      browserIds: input.browserIds,
      eventId: input.eventId,
      eventSourceUrl: input.eventSourceUrl,
    }),
  };
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

function isServerBuiltTrackingEventConfig(eventConfig: TrackingEventConfig): boolean {
  return Boolean(eventConfig.meta || eventConfig.server);
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
): TrackingEventPayload & { id: string } {
  const eventId = options.eventId ?? options.submission?.submissionId ?? crypto.randomUUID();
  const metaPayload = eventConfig.meta
    ? createMetaPayload(form, eventConfig, {
        step: options.step,
        stepIndex: options.stepIndex,
        answers: options.answers,
        submission: options.submission,
        browserIds: options.browserIds,
        eventId,
        eventSourceUrl: options.eventSourceUrl,
        extra: options.extra,
      })
    : undefined;
  const resolvedEventId = metaPayload?.event_id ?? eventId;

  return {
    event: eventConfig.name,
    id: resolvedEventId,
    route_key: routeKey,
    form_name: form.name,
    page_name: form.page.name,
    ...getIncludedContextPayload(form, eventConfig.includeContext),
    ...(eventConfig.includeStep ? getStepTrackingPayload(options.step, options.stepIndex) : {}),
    ...(options.extra ?? {}),
    ...(metaPayload ? { meta: metaPayload } : {}),
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
    extra?: Record<string, unknown>;
  },
): TrackingMetaPayload | undefined {
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
  const trustedFormSubstep: "review" | "consent" | undefined =
    options.extra?.trusted_form_substep === "review" || options.extra?.trusted_form_substep === "consent"
      ? options.extra.trusted_form_substep
      : undefined;
  const input = {
    context: form.context,
    answers,
    submission: { id: options.submission?.submissionId ?? eventId },
    event: { id: eventId, kind: eventConfig.kind, ...(trustedFormSubstep ? { trustedFormSubstep } : {}) },
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
      test_event_code: meta.testEventCode,
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
