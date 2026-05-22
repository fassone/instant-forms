import type { Hono } from "hono";

import type { ScriptProxyRegistry } from "../../scripts";
import { getPartytownAssetPath, proxySelectedScript } from "../../scripts";

export function registerScriptRoutes(app: Hono, registry: ScriptProxyRegistry): void {
  app.all("/_instant/trustedform/proxy", (c) => proxyTrustedFormRequest(c.req.raw));
  app.all("/_instant/google-tags/proxy", (c) => proxyGoogleTagRequest(c.req.raw));

  app.get("/_instant/scripts/*", (c) => {
    const scriptFile = getScriptFileFromPath(new URL(c.req.url).pathname);
    if (!scriptFile?.endsWith(".js")) {
      return new Response("Not found", { status: 404 });
    }

    return proxySelectedScript(c.req.raw, registry, scriptFile.slice(0, -3));
  });

  app.get("/~partytown/*", async (c) => {
    const assetPath = getPartytownAssetPath(new URL(c.req.url).pathname);
    if (!assetPath) {
      return new Response("Not found", { status: 404 });
    }

    const file = Bun.file(assetPath);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Cache-Control": "public, max-age=86400",
        "Content-Type": getPartytownContentType(assetPath),
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

const trustedFormProxyTimeoutMs = 4_500;
const trustedFormProxyAllowedMethods = new Set(["GET", "HEAD", "POST"]);
const googleTagProxyTimeoutMs = 4_500;
const googleTagProxyAllowedMethods = new Set(["GET", "HEAD", "POST"]);
const allowedGoogleTagHosts = new Set([
  "www.googletagmanager.com",
  "www.google-analytics.com",
  "region1.google-analytics.com",
  "stats.g.doubleclick.net",
  "www.googleadservices.com",
]);

async function proxyGoogleTagRequest(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const target = requestUrl.searchParams.get("u");

  if (!target) {
    return new Response("Missing target URL.", { status: 400 });
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return new Response("Invalid target URL.", { status: 400 });
  }

  if (!isAllowedGoogleTagUrl(upstreamUrl)) {
    return new Response("Target URL is not allowlisted.", { status: 400 });
  }

  if (!googleTagProxyAllowedMethods.has(request.method)) {
    return new Response("Method not allowed.", { status: 405 });
  }

  return proxyAllowlistedRequest(request, upstreamUrl, googleTagProxyTimeoutMs, "Unable to proxy Google tag request.");
}

async function proxyTrustedFormRequest(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const target = requestUrl.searchParams.get("u");

  if (!target) {
    return new Response("Missing target URL.", { status: 400 });
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return new Response("Invalid target URL.", { status: 400 });
  }

  if (!isAllowedTrustedFormUrl(upstreamUrl)) {
    return new Response("Target URL is not allowlisted.", { status: 400 });
  }

  if (!trustedFormProxyAllowedMethods.has(request.method)) {
    return new Response("Method not allowed.", { status: 405 });
  }

  return proxyAllowlistedRequest(request, upstreamUrl, trustedFormProxyTimeoutMs, "Unable to proxy TrustedForm request.");
}

async function proxyAllowlistedRequest(
  request: Request,
  upstreamUrl: URL,
  timeoutMs: number,
  failureMessage: string,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      credentials: "omit",
      headers: getProxyForwardHeaders(request.headers),
      method: request.method,
      redirect: "follow",
      signal: abortController.signal,
    });
    const body = await upstreamResponse.arrayBuffer();
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Length": String(body.byteLength),
      "Content-Type": upstreamResponse.headers.get("Content-Type") ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    return new Response(body, {
      status: upstreamResponse.status,
      headers,
    });
  } catch {
    return new Response(failureMessage, {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getProxyForwardHeaders(requestHeaders: Headers): Headers {
  const headers = new Headers();
  const accept = requestHeaders.get("Accept");
  const contentType = requestHeaders.get("Content-Type");

  if (accept) {
    headers.set("Accept", accept);
  }

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  return headers;
}

function isAllowedTrustedFormUrl(url: URL): boolean {
  return url.protocol === "https:" && (url.hostname === "trustedform.com" || url.hostname.endsWith(".trustedform.com"));
}

function isAllowedGoogleTagUrl(url: URL): boolean {
  return url.protocol === "https:" && allowedGoogleTagHosts.has(url.hostname);
}

function getScriptFileFromPath(pathname: string): string | undefined {
  const scriptPath = pathname.slice("/_instant/scripts/".length);
  return scriptPath.split("/").filter(Boolean).at(-1);
}

function getPartytownContentType(assetPath: string): string {
  if (assetPath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  return "application/javascript; charset=utf-8";
}
