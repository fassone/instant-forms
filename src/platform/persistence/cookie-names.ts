import { createHash } from "node:crypto";

type PlatformCookiePurpose = "checkpoint" | "postSubmit" | "trackingVisitorId";

const COOKIE_NAME_PREFIX = "if_";
const COOKIE_NAME_HASH_LENGTH = 16;
const COOKIE_NAME_SEED_VERSION = "instant-forms:v1";

export function getCheckpointCookieName(routeKey: string): string {
  return createOpaqueCookieName("checkpoint", routeKey);
}

export function getLegacyCheckpointCookieName(routeKey: string): string {
  return `instant_forms_${normalizeRouteKey(routeKey)}_answers`;
}

export function getPostSubmitCookieName(routeKey: string): string {
  return createOpaqueCookieName("postSubmit", routeKey);
}

export function getLegacyPostSubmitCookieName(routeKey: string): string {
  return `instant_forms_${normalizeRouteKey(routeKey)}_post_submit`;
}

export function getTrackingVisitorIdCookieName(): string {
  return createOpaqueCookieName("trackingVisitorId");
}

export function getLegacyTrackingVisitorIdCookieName(): string {
  return "instant_forms_visitor_id";
}

export function createOpaqueCookieName(purpose: PlatformCookiePurpose, routeKey?: string): string {
  const seed = `${COOKIE_NAME_SEED_VERSION}:${purpose}:${routeKey ? normalizeRouteKey(routeKey) : ""}`;
  const hash = createHash("sha256")
    .update(seed)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "")
    .slice(0, COOKIE_NAME_HASH_LENGTH);

  return `${COOKIE_NAME_PREFIX}${hash}`;
}

function normalizeRouteKey(routeKey: string): string {
  return routeKey.trim().toLowerCase();
}
