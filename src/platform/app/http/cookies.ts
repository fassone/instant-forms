import type { Context } from "hono";
import { generateCookie, getCookie } from "hono/cookie";
import { customAlphabet } from "nanoid";

import {
  CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
  decodeCheckpointAnswers,
  encodeCheckpointAnswers,
  sanitizeCheckpointAnswers,
  type CheckpointAnswers,
} from "../../persistence/checkpoints";
import {
  getCheckpointCookieName,
  getLegacyCheckpointCookieName,
  getLegacyPostSubmitCookieName,
  getLegacyTrackingVisitorIdCookieName,
  getPostSubmitCookieName,
  getTrackingVisitorIdCookieName,
} from "../../persistence/cookie-names";
import type { AttributionCookieHelpers, AttributionCookieOptions, InstantForm, TrackingVisitorIdConfig } from "../../flow";
import type { TrackingEventPayload } from "../../rendering";

const POST_SUBMIT_COOKIE_MAX_AGE_SECONDS = 5 * 60;
const TRACKING_VISITOR_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TRACKING_VISITOR_ID_LENGTH = 24;
const trackingVisitorIdPattern = /^[0-9A-Za-z]{24}$/u;
const createTrackingVisitorId = customAlphabet(TRACKING_VISITOR_ID_ALPHABET, TRACKING_VISITOR_ID_LENGTH);
const requestTrackingVisitorIds = new WeakMap<Request, string>();
const requestPlatformCookieHeaders = new WeakMap<Request, string[]>();

export type PostSubmitState = {
  trackingEvents: readonly TrackingEventPayload[];
  stepCountLabel: string;
};

export type AttributionCookieCollector = {
  cookies: AttributionCookieHelpers;
  applyTo: (response: Response) => Response;
};

export function readCheckpointAnswers(c: Context, form: InstantForm, routeKey: string): CheckpointAnswers {
  const cookieName = getCheckpointCookieName(routeKey);
  const cookieValue = getCookie(c, cookieName);
  if (cookieValue !== undefined) {
    return sanitizeCheckpointAnswers(form, decodeCheckpointAnswers(cookieValue));
  }

  const legacyCookieName = getLegacyCheckpointCookieName(routeKey);
  const legacyCookieValue = getCookie(c, legacyCookieName);
  if (legacyCookieValue === undefined) {
    return sanitizeCheckpointAnswers(form, {});
  }

  const sanitizedAnswers = sanitizeCheckpointAnswers(form, decodeCheckpointAnswers(legacyCookieValue));
  if (Object.keys(sanitizedAnswers).length > 0) {
    setPlatformCookie(c, cookieName, encodeCheckpointAnswers(sanitizedAnswers), {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
      secure: isSecureRequest(c.req.raw),
    });
  }
  deletePlatformCookie(c, legacyCookieName, {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });

  return sanitizedAnswers;
}

export function setCheckpointAnswers(c: Context, routeKey: string, answers: CheckpointAnswers): void {
  setPlatformCookie(c, getCheckpointCookieName(routeKey), encodeCheckpointAnswers(answers), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(c.req.raw),
  });
}

export function clearCheckpointAnswers(c: Context, routeKey: string): void {
  deletePlatformCookie(c, getCheckpointCookieName(routeKey), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
  deletePlatformCookie(c, getLegacyCheckpointCookieName(routeKey), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
}

export function readPostSubmitState(c: Context, routeKey: string): PostSubmitState | undefined {
  const cookieName = getPostSubmitCookieName(routeKey);
  const cookieValue = getCookie(c, cookieName);
  if (cookieValue !== undefined) {
    return decodePostSubmitState(cookieValue);
  }

  const legacyCookieName = getLegacyPostSubmitCookieName(routeKey);
  const legacyCookieValue = getCookie(c, legacyCookieName);
  if (legacyCookieValue === undefined) {
    return undefined;
  }

  const decodedValue = decodePostSubmitState(legacyCookieValue);
  if (decodedValue) {
    setPostSubmitCookie(c, cookieName, decodedValue);
  }
  deletePlatformCookie(c, legacyCookieName, {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });

  return decodedValue;
}

export function setPostSubmitState(
  c: Context,
  routeKey: string,
  state: PostSubmitState,
): void {
  setPostSubmitCookie(c, getPostSubmitCookieName(routeKey), state);
}

export function clearPostSubmitState(c: Context, routeKey: string): void {
  deletePlatformCookie(c, getPostSubmitCookieName(routeKey), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
  deletePlatformCookie(c, getLegacyPostSubmitCookieName(routeKey), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
}

export function ensureTrackingVisitorId(c: Context, config: TrackingVisitorIdConfig | undefined): string | undefined {
  if (!config) {
    return undefined;
  }

  const requestValue = requestTrackingVisitorIds.get(c.req.raw);
  if (isTrackingVisitorId(requestValue)) {
    return requestValue;
  }

  const cookieName = getTrackingVisitorIdCookieName();
  const existingValue = getCookie(c, cookieName);
  if (isTrackingVisitorId(existingValue)) {
    requestTrackingVisitorIds.set(c.req.raw, existingValue);
    return existingValue;
  }

  const legacyCookieName = getLegacyTrackingVisitorIdCookieName();
  const legacyValue = getCookie(c, legacyCookieName);
  if (isTrackingVisitorId(legacyValue)) {
    requestTrackingVisitorIds.set(c.req.raw, legacyValue);
    setTrackingVisitorIdCookie(c, cookieName, legacyValue, config.cookie.maxAgeSeconds);
    deletePlatformCookie(c, legacyCookieName, {
      path: "/",
      secure: isSecureRequest(c.req.raw),
    });
    return legacyValue;
  }

  if (legacyValue !== undefined) {
    deletePlatformCookie(c, legacyCookieName, {
      path: "/",
      secure: isSecureRequest(c.req.raw),
    });
  }

  const generatedValue = createTrackingVisitorId();
  requestTrackingVisitorIds.set(c.req.raw, generatedValue);
  setTrackingVisitorIdCookie(c, cookieName, generatedValue, config.cookie.maxAgeSeconds);

  return generatedValue;
}

export function applyTrackingVisitorIdCookie(c: Context, response: Response): Response {
  return applyPlatformCookieHeaders(c, response);
}

export function applyPlatformCookieHeaders(c: Context, response: Response): Response {
  const cookies = requestPlatformCookieHeaders.get(c.req.raw) ?? [];
  for (const cookie of cookies) {
    response.headers.append("Set-Cookie", cookie);
  }

  return response;
}

export function readTrackingVisitorId(c: Context, config: TrackingVisitorIdConfig | undefined): string | undefined {
  if (!config) {
    return undefined;
  }

  const requestValue = requestTrackingVisitorIds.get(c.req.raw);
  if (isTrackingVisitorId(requestValue)) {
    return requestValue;
  }

  const cookieValue = getCookie(c, getTrackingVisitorIdCookieName());
  if (isTrackingVisitorId(cookieValue)) {
    requestTrackingVisitorIds.set(c.req.raw, cookieValue);
    return cookieValue;
  }

  const legacyCookieValue = getCookie(c, getLegacyTrackingVisitorIdCookieName());
  if (isTrackingVisitorId(legacyCookieValue)) {
    requestTrackingVisitorIds.set(c.req.raw, legacyCookieValue);
    return legacyCookieValue;
  }

  return undefined;
}

export function createAttributionCookieCollector(c: Context): AttributionCookieCollector {
  const setCookieHeaders: string[] = [];

  return {
    cookies: {
      get: (name: string) => getCookie(c, name),
      set: (name: string, value: string, options: AttributionCookieOptions = {}) => {
        setCookieHeaders.push(
          generateCookie(name, value, {
            path: options.path ?? "/",
            maxAge: options.maxAge,
            sameSite: options.sameSite,
            httpOnly: options.httpOnly,
            secure: options.secure ?? isSecureRequest(c.req.raw),
          }),
        );
      },
    },
    applyTo: (response: Response) => {
      for (const cookie of setCookieHeaders) {
        response.headers.append("Set-Cookie", cookie);
      }

      return response;
    },
  };
}

function setPostSubmitCookie(c: Context, cookieName: string, state: PostSubmitState): void {
  setPlatformCookie(c, cookieName, encodePostSubmitState(state), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: POST_SUBMIT_COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(c.req.raw),
  });
}

function setTrackingVisitorIdCookie(c: Context, cookieName: string, value: string, maxAgeSeconds: number): void {
  setPlatformCookie(c, cookieName, value, {
    path: "/",
    maxAge: maxAgeSeconds,
    sameSite: "Lax",
    secure: isSecureRequest(c.req.raw),
  });
}

function setPlatformCookie(
  c: Context,
  name: string,
  value: string,
  options: NonNullable<Parameters<typeof generateCookie>[2]>,
): void {
  appendPlatformCookie(c, generateCookie(name, value, options));
}

function deletePlatformCookie(c: Context, name: string, options: NonNullable<Parameters<typeof generateCookie>[2]>): void {
  appendPlatformCookie(c, generateCookie(name, "", { ...options, maxAge: 0 }));
}

function appendPlatformCookie(c: Context, cookie: string): void {
  c.header("Set-Cookie", cookie, { append: true });

  const cookies = requestPlatformCookieHeaders.get(c.req.raw) ?? [];
  cookies.push(cookie);
  requestPlatformCookieHeaders.set(c.req.raw, cookies);
}

function encodePostSubmitState(state: PostSubmitState): string {
  return encodeCookieJson(state);
}

function decodePostSubmitState(value: string | undefined): PostSubmitState | undefined {
  if (!value) {
    return undefined;
  }

  const decodedValue = decodeCookieJson(value);
  if (!isRecord(decodedValue)) {
    return undefined;
  }

  const trackingEvents = decodedValue.trackingEvents;
  const stepCountLabel = decodedValue.stepCountLabel;
  if (!Array.isArray(trackingEvents) || typeof stepCountLabel !== "string" || !stepCountLabel.trim()) {
    return undefined;
  }

  return {
    trackingEvents: trackingEvents.filter(isTrackingEventPayload),
    stepCountLabel,
  };
}

function encodeCookieJson(value: unknown): string {
  const json = JSON.stringify(value);

  return Buffer.from(json, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeCookieJson(value: string): unknown {
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = Buffer.from(paddedBase64, "base64").toString("utf8");

    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function isTrackingEventPayload(value: unknown): value is TrackingEventPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "event" in value &&
    typeof value.event === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrackingVisitorId(value: string | undefined): value is string {
  return Boolean(value && trackingVisitorIdPattern.test(value));
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
