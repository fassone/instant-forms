import type { Context, MiddlewareHandler } from "hono";
import { compress } from "hono-compress";

const COMPRESSIBLE_CONTENT_TYPES = [
  "text/html",
  "application/javascript",
  "application/json",
  "text/plain",
  "text/css",
] as const;

const MIN_COMPRESSIBLE_BYTES = 1024;
const compressionRuntimeReady = Promise.allSettled([import("node:stream"), import("node:zlib")]);

export function createCompressionMiddleware(): MiddlewareHandler {
  const compressionCandidates = new WeakSet<Request>();
  const compressionMiddleware = compress({
    encodings: ["br", "gzip"],
    threshold: MIN_COMPRESSIBLE_BYTES,
    filter: (c) => {
      const shouldCompress = isCompressibleResponse(c);
      if (shouldCompress) {
        compressionCandidates.add(c.req.raw);
      }
      return shouldCompress;
    },
  });

  return async (c, next) => {
    await compressionRuntimeReady;
    await compressionMiddleware(c, next);

    if (compressionCandidates.has(c.req.raw) && c.res.headers.has("Content-Encoding")) {
      appendVaryHeader(c.res.headers, "Accept-Encoding");
    }
  };
}

function isCompressibleResponse(c: Context): boolean {
  if (c.req.method === "HEAD" || c.req.header("x-no-compression")) {
    return false;
  }

  if (c.res.status !== 200 || c.res.headers.has("Content-Encoding")) {
    return false;
  }

  const transferEncoding = c.res.headers.get("Transfer-Encoding");
  if (transferEncoding && /(?:^|,)\s*(compress|gzip|deflate)\s*(?:,|$)/iu.test(transferEncoding)) {
    return false;
  }

  const cacheControl = c.res.headers.get("Cache-Control");
  if (cacheControl && /(?:^|,)\s*no-transform\s*(?:,|$)/iu.test(cacheControl)) {
    return false;
  }

  const contentLength = c.res.headers.get("Content-Length");
  if (contentLength && Number(contentLength) < MIN_COMPRESSIBLE_BYTES) {
    return false;
  }

  const contentType = c.res.headers.get("Content-Type") ?? "";
  return COMPRESSIBLE_CONTENT_TYPES.some((type) => contentType.includes(type));
}

function appendVaryHeader(headers: Headers, value: string): void {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", value);
    return;
  }

  const values = current.split(",").map((part) => part.trim().toLowerCase());
  if (!values.includes(value.toLowerCase())) {
    headers.set("Vary", `${current}, ${value}`);
  }
}
