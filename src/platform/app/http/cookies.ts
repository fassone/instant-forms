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

export function readCheckpointAnswers(c: Context, form: InstantForm): CheckpointAnswers {
  const cookieValue = getCookie(c, getCheckpointCookieName(form.areaCode));
  const decodedAnswers = decodeCheckpointAnswers(cookieValue);

  return sanitizeCheckpointAnswers(form, decodedAnswers);
}

export function setCheckpointAnswers(c: Context, form: InstantForm, answers: CheckpointAnswers): void {
  setCookie(c, getCheckpointCookieName(form.areaCode), encodeCheckpointAnswers(answers), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: CHECKPOINT_COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(c.req.raw),
  });
}

export function clearCheckpointAnswers(c: Context, form: InstantForm): void {
  deleteCookie(c, getCheckpointCookieName(form.areaCode), {
    path: "/",
    secure: isSecureRequest(c.req.raw),
  });
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
