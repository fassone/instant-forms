import type { ScriptProxyRegistry } from "./proxy-registry";
import { buildScriptProxyUpstreamUrl, getScriptProxyDefinition } from "./proxy-registry";

const defaultScriptProxyCacheControl = "public, max-age=300, stale-while-revalidate=3600";

export async function proxySelectedScript(
  request: Request,
  registry: ScriptProxyRegistry,
  scriptKey: string,
): Promise<Response> {
  const definition = getScriptProxyDefinition(registry, scriptKey);
  if (!definition) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamUrlResult = buildScriptProxyUpstreamUrl(definition, new URL(request.url));
  if (!upstreamUrlResult.ok) {
    return new Response(upstreamUrlResult.message, { status: upstreamUrlResult.status });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrlResult.url, {
      credentials: "omit",
      headers: {
        Accept: "application/javascript,*/*;q=0.8",
      },
    });
  } catch {
    return new Response("Unable to fetch selected script.", { status: 502 });
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return new Response("Unable to fetch selected script.", { status: 502 });
  }

  return new Response(upstreamResponse.body, {
    status: 200,
    headers: {
      "Cache-Control": definition.cacheControl ?? defaultScriptProxyCacheControl,
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
