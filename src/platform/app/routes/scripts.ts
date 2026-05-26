import type { Hono } from "hono";

import type { RequestProxyDefinition, RequestProxyRegistry, RequestProxySpecialRoute, ScriptProxyRegistry } from "../../scripts";
import {
  buildRequestProxySpecialRouteUpstreamUrl,
  buildRequestProxyUpstreamUrl,
  getPartytownAssetPath,
  getRequestProxyDefinitions,
  isRequestProxyMethodAllowed,
  proxySelectedScript,
} from "../../scripts";

export function registerScriptRoutes(
  app: Hono,
  registry: ScriptProxyRegistry,
  requestProxyRegistry: RequestProxyRegistry,
): void {
  for (const definition of getRequestProxyDefinitions(requestProxyRegistry)) {
    app.all(definition.route, (c) => proxyRequestProxyRequest(c.req.raw, definition));
    for (const specialRoute of definition.specialRoutes ?? []) {
      app.all(specialRoute.route, (c) => proxyRequestProxySpecialRoute(c.req.raw, definition, specialRoute));
      app.all(`${specialRoute.route}/*`, (c) => proxyRequestProxySpecialRoute(c.req.raw, definition, specialRoute));
    }
  }

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

async function proxyRequestProxyRequest(request: Request, definition: RequestProxyDefinition): Promise<Response> {
  const requestUrl = new URL(request.url);
  const upstreamUrlResult = buildRequestProxyUpstreamUrl(definition, requestUrl);
  if (!upstreamUrlResult.ok) {
    return new Response(upstreamUrlResult.message, { status: upstreamUrlResult.status });
  }
  if (!isRequestProxyMethodAllowed(definition, request.method)) {
    return new Response("Method not allowed.", { status: 405 });
  }

  return proxyAllowlistedRequest(
    request,
    upstreamUrlResult.url,
    definition.timeoutMs,
    `Unable to proxy ${getRequestProxyFailureName(definition)} request.`,
    getRequestProxyTransform(definition),
  );
}

async function proxyRequestProxySpecialRoute(
  request: Request,
  definition: RequestProxyDefinition,
  specialRoute: RequestProxySpecialRoute,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const upstreamUrlResult = buildRequestProxySpecialRouteUpstreamUrl(definition, specialRoute, requestUrl);
  if (!upstreamUrlResult.ok) {
    return new Response(upstreamUrlResult.message, { status: upstreamUrlResult.status });
  }
  if (!isRequestProxyMethodAllowed(definition, request.method)) {
    return new Response("Method not allowed.", { status: 405 });
  }

  return proxyAllowlistedRequest(
    request,
    upstreamUrlResult.url,
    definition.timeoutMs,
    `Unable to proxy ${getRequestProxyFailureName(definition)} request.`,
    getRequestProxyTransform(definition),
  );
}

async function proxyAllowlistedRequest(
  request: Request,
  upstreamUrl: URL,
  timeoutMs: number,
  failureMessage: string,
  transformResponse?: (body: ArrayBuffer, upstreamUrl: URL, headers: Headers) => { body: ArrayBuffer; contentType?: string },
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
    const upstreamBody = await upstreamResponse.arrayBuffer();
    const transformedResponse = transformResponse?.(upstreamBody, upstreamUrl, upstreamResponse.headers);
    const body = transformedResponse?.body ?? upstreamBody;
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Length": String(body.byteLength),
      "Content-Type": transformedResponse?.contentType ?? upstreamResponse.headers.get("Content-Type") ?? "application/octet-stream",
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

function rewriteMetaPixelScriptResponse(
  body: ArrayBuffer,
  upstreamUrl: URL,
  headers: Headers,
): { body: ArrayBuffer; contentType?: string } {
  const contentType = headers.get("Content-Type") ?? "";
  const isMetaScript =
    upstreamUrl.hostname === "connect.facebook.net" &&
    (upstreamUrl.pathname.endsWith(".js") || contentType.includes("javascript"));

  if (!isMetaScript) {
    return { body };
  }

  const source = new TextDecoder().decode(body);
  const rewrittenSource = source
    .replaceAll("https://www.facebook.com/tr/", "/_instant/meta/tr/")
    .replaceAll("https://www.facebook.com/tr", "/_instant/meta/tr")
    .replaceAll("http://www.facebook.com/tr/", "/_instant/meta/tr/")
    .replaceAll("http://www.facebook.com/tr", "/_instant/meta/tr")
    .replaceAll("//www.facebook.com/tr/", "/_instant/meta/tr/")
    .replaceAll("//www.facebook.com/tr", "/_instant/meta/tr");

  return {
    body: new TextEncoder().encode(rewrittenSource).buffer,
    contentType: contentType || "application/javascript; charset=utf-8",
  };
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

function getRequestProxyFailureName(definition: RequestProxyDefinition): string {
  switch (definition.key) {
    case "googleTags":
      return "Google tag";
    case "metaPixel":
      return "Meta Pixel";
    case "trustedForm":
      return "TrustedForm";
    default:
      return definition.key;
  }
}

function getRequestProxyTransform(
  definition: RequestProxyDefinition,
): ((body: ArrayBuffer, upstreamUrl: URL, headers: Headers) => { body: ArrayBuffer; contentType?: string }) | undefined {
  return definition.key === "metaPixel" ? rewriteMetaPixelScriptResponse : undefined;
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
