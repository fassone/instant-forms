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
import { getRequestId, logInstantFormEvent, type InstantFormLogger } from "../../logging";

export function registerScriptRoutes(
  app: Hono,
  registry: ScriptProxyRegistry,
  requestProxyRegistry: RequestProxyRegistry,
  eventLogger?: InstantFormLogger,
): void {
  for (const definition of getRequestProxyDefinitions(requestProxyRegistry)) {
    app.all(definition.route, (c) => proxyRequestProxyRequest(c.req.raw, definition, eventLogger));
    for (const specialRoute of definition.specialRoutes ?? []) {
      app.all(specialRoute.route, (c) => proxyRequestProxySpecialRoute(c.req.raw, definition, specialRoute, eventLogger));
      app.all(`${specialRoute.route}/*`, (c) => proxyRequestProxySpecialRoute(c.req.raw, definition, specialRoute, eventLogger));
    }
  }

  app.get("/_instant/scripts/*", async (c) => {
    const requestUrl = new URL(c.req.url);
    const scriptFile = getScriptFileFromPath(requestUrl.pathname);
    if (!scriptFile?.endsWith(".js")) {
      return new Response("Not found", { status: 404 });
    }

    const startedAt = Date.now();
    const response = await proxySelectedScript(c.req.raw, registry, scriptFile.slice(0, -3));
    if (response.status >= 400) {
      logScriptProxyEvent(eventLogger, c.req.raw, {
        event: "proxy.selected_script_failed",
        status: response.status,
        durationMs: Date.now() - startedAt,
        data: { scriptFile, path: requestUrl.pathname },
      });
    } else {
      logScriptProxyEvent(eventLogger, c.req.raw, {
        level: "info",
        event: "proxy.selected_script_succeeded",
        status: response.status,
        durationMs: Date.now() - startedAt,
        data: {
          scriptFile,
          path: requestUrl.pathname,
          responseContentType: response.headers.get("Content-Type") ?? undefined,
          responseBytes: getResponseByteLength(response.headers),
        },
      });
    }

    return response;
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

async function proxyRequestProxyRequest(
  request: Request,
  definition: RequestProxyDefinition,
  eventLogger?: InstantFormLogger,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const upstreamUrlResult = buildRequestProxyUpstreamUrl(definition, requestUrl);
  if (!upstreamUrlResult.ok) {
    logScriptProxyEvent(eventLogger, request, {
      event: "proxy.request_rejected",
      status: upstreamUrlResult.status,
      data: { proxyKey: definition.key, reason: upstreamUrlResult.message, path: requestUrl.pathname },
    });
    return new Response(upstreamUrlResult.message, { status: upstreamUrlResult.status });
  }
  if (!isRequestProxyMethodAllowed(definition, request.method)) {
    logScriptProxyEvent(eventLogger, request, {
      event: "proxy.request_rejected",
      status: 405,
      data: { proxyKey: definition.key, reason: "method_not_allowed", method: request.method, path: requestUrl.pathname },
    });
    return new Response("Method not allowed.", { status: 405 });
  }

  return proxyAllowlistedRequest(
    request,
    upstreamUrlResult.url,
    definition.timeoutMs,
    `Unable to proxy ${getRequestProxyFailureName(definition)} request.`,
    getRequestProxyTransform(definition),
    eventLogger,
    definition.key,
  );
}

async function proxyRequestProxySpecialRoute(
  request: Request,
  definition: RequestProxyDefinition,
  specialRoute: RequestProxySpecialRoute,
  eventLogger?: InstantFormLogger,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const upstreamUrlResult = buildRequestProxySpecialRouteUpstreamUrl(definition, specialRoute, requestUrl);
  if (!upstreamUrlResult.ok) {
    logScriptProxyEvent(eventLogger, request, {
      event: "proxy.request_rejected",
      status: upstreamUrlResult.status,
      data: { proxyKey: definition.key, reason: upstreamUrlResult.message, path: requestUrl.pathname },
    });
    return new Response(upstreamUrlResult.message, { status: upstreamUrlResult.status });
  }
  if (!isRequestProxyMethodAllowed(definition, request.method)) {
    logScriptProxyEvent(eventLogger, request, {
      event: "proxy.request_rejected",
      status: 405,
      data: { proxyKey: definition.key, reason: "method_not_allowed", method: request.method, path: requestUrl.pathname },
    });
    return new Response("Method not allowed.", { status: 405 });
  }

  return proxyAllowlistedRequest(
    request,
    upstreamUrlResult.url,
    definition.timeoutMs,
    `Unable to proxy ${getRequestProxyFailureName(definition)} request.`,
    getRequestProxyTransform(definition),
    eventLogger,
    definition.key,
  );
}

async function proxyAllowlistedRequest(
  request: Request,
  upstreamUrl: URL,
  timeoutMs: number,
  failureMessage: string,
  transformResponse?: (body: ArrayBuffer, upstreamUrl: URL, headers: Headers) => { body: ArrayBuffer; contentType?: string },
  eventLogger?: InstantFormLogger,
  proxyKey?: string,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);
  const startedAt = Date.now();

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

    logScriptProxyEvent(eventLogger, request, {
      level: "info",
      event: "proxy.request_succeeded",
      status: upstreamResponse.status,
      durationMs: Date.now() - startedAt,
      data: {
        proxyKey,
        method: request.method,
        path: new URL(request.url).pathname,
        upstreamHost: upstreamUrl.hostname,
        upstreamPath: upstreamUrl.pathname,
        responseContentType: headers.get("Content-Type") ?? undefined,
        responseBytes: body.byteLength,
      },
    });

    return new Response(body, {
      status: upstreamResponse.status,
      headers,
    });
  } catch (error) {
    logScriptProxyEvent(eventLogger, request, {
      event: "proxy.request_failed",
      status: 502,
      durationMs: Date.now() - startedAt,
      data: {
        proxyKey,
        upstreamUrl: upstreamUrl.toString(),
        method: request.method,
        message: error instanceof Error ? error.message : String(error),
      },
    });
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

function logScriptProxyEvent(
  logger: InstantFormLogger | undefined,
  request: Request,
  input: {
    level?: "debug" | "info" | "warn" | "error";
    event: string;
    status: number;
    durationMs?: number;
    data?: unknown;
  },
): void {
  logInstantFormEvent(logger, {
    level: input.level ?? (input.status >= 500 ? "error" : "warn"),
    event: input.event,
    requestId: getRequestId(request),
    status: input.status,
    durationMs: input.durationMs,
    data: input.data,
  });
}

function getResponseByteLength(headers: Headers): number | undefined {
  const contentLength = headers.get("Content-Length");
  if (!contentLength) {
    return undefined;
  }

  const bytes = Number(contentLength);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : undefined;
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
