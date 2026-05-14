import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function htmlResponse(body: string, status = 200, cacheControl = "public, max-age=300"): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

export function redirectNoStore(c: Context, url: string): Response {
  c.header("Cache-Control", "no-store");

  return c.redirect(url, 302);
}

export function jsonResponse(c: Context, body: unknown, status: ContentfulStatusCode): Response {
  c.header("Cache-Control", "no-store");

  return c.json(body, status);
}

export function assetResponse(body: Blob, contentType: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
