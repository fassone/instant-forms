import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import {
  CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
  decodeCheckpointAnswers,
  encodeCheckpointAnswers,
  getCheckpointCookieName,
  sanitizeCheckpointAnswers,
  type CheckpointAnswers,
} from "../../persistence/checkpoints";
import type { InstantForm } from "../../flow";

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

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
