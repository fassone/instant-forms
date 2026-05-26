import type { Context } from "hono";
import { deleteCookie, generateCookie, getCookie, setCookie } from "hono/cookie";

import {
  CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
  decodeCheckpointAnswers,
  encodeCheckpointAnswers,
  getCheckpointCookieName,
  sanitizeCheckpointAnswers,
  type CheckpointAnswers,
} from "../../persistence/checkpoints";
import type { AttributionCookieHelpers, AttributionCookieOptions, InstantForm } from "../../flow";
import type { TrackingEventPayload } from "../../rendering";

const POST_SUBMIT_COOKIE_MAX_AGE_SECONDS = 5 * 60;

export type PostSubmitState = {
  trackingEvents: readonly TrackingEventPayload[];
  stepCountLabel: string;
};

export type AttributionCookieCollector = {
  cookies: AttributionCookieHelpers;
  applyTo: (response: Response) => Response;
};

export function readCheckpointAnswers(c: Context, form: InstantForm, routeKey: string): CheckpointAnswers {
  const cookieValue = getCookie(c, getCheckpointCookieName(routeKey));
  const decodedAnswers = decodeCheckpointAnswers(cookieValue);

  return sanitizeCheckpointAnswers(form, decodedAnswers);
}

export function setCheckpointAnswers(c: Context, routeKey: string, answers: CheckpointAnswers): void {
  setCookie(c, getCheckpointCookieName(routeKey), encodeCheckpointAnswers(answers), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(c.req.raw),
  });
}

export function clearCheckpointAnswers(c: Context, routeKey: string): void {
  deleteCookie(c, getCheckpointCookieName(routeKey), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
}

export function readPostSubmitState(c: Context, routeKey: string): PostSubmitState | undefined {
  const cookieValue = getCookie(c, getPostSubmitCookieName(routeKey));
  const decodedValue = decodePostSubmitState(cookieValue);

  return decodedValue;
}

export function setPostSubmitState(
  c: Context,
  routeKey: string,
  state: PostSubmitState,
): void {
  setCookie(c, getPostSubmitCookieName(routeKey), encodePostSubmitState(state), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: POST_SUBMIT_COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(c.req.raw),
  });
}

export function clearPostSubmitState(c: Context, routeKey: string): void {
  deleteCookie(c, getPostSubmitCookieName(routeKey), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
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

function getPostSubmitCookieName(routeKey: string): string {
  return `instant_forms_${routeKey.toLowerCase()}_post_submit`;
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

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
