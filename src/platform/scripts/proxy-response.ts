import type { ScriptProxyRegistry } from "./proxy-registry";
import { buildScriptProxyUpstreamUrl, getScriptProxyDefinition, type ScriptProxyDefinition } from "./proxy-registry";

const defaultScriptProxyCacheControl = "public, max-age=300, stale-while-revalidate=3600";
const defaultScriptProxyTimeoutMs = 4_500;
const scriptProxyFailureBody = "/* Unable to fetch selected script. */";
const nodeFetchScript = `
const upstreamUrl = process.argv[1];
const timeoutMs = Number(process.argv[2]);
const timeoutSignal = AbortSignal.timeout(timeoutMs);

try {
  const response = await fetch(upstreamUrl, {
    credentials: "omit",
    headers: {
      Accept: "application/javascript,*/*;q=0.8",
    },
    redirect: "follow",
    signal: timeoutSignal,
  });

  if (!response.ok) {
    process.exit(2);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength === 0) {
    process.exit(3);
  }

  process.stdout.write(body);
} catch {
  process.exit(1);
}
`;

export type ScriptProxyOptions = {
  nodeFetch?: (url: URL, timeoutMs: number) => Promise<ArrayBuffer | undefined>;
};

export async function proxySelectedScript(
  request: Request,
  registry: ScriptProxyRegistry,
  scriptKey: string,
  options: ScriptProxyOptions = {},
): Promise<Response> {
  const definition = getScriptProxyDefinition(registry, scriptKey);
  if (!definition) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamUrlResult = buildScriptProxyUpstreamUrl(definition, new URL(request.url));
  if (!upstreamUrlResult.ok) {
    return new Response(upstreamUrlResult.message, { status: upstreamUrlResult.status });
  }

  const scriptBody = applyScriptProxyReplacements(
    await fetchSelectedScriptBody(definition, upstreamUrlResult.url, options),
    definition,
  );
  if (!scriptBody || scriptBody.byteLength === 0) {
    return createScriptProxyFailureResponse();
  }

  return new Response(scriptBody, {
    status: 200,
    headers: {
      "Cache-Control": definition.cacheControl ?? defaultScriptProxyCacheControl,
      "Content-Length": String(scriptBody.byteLength),
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function applyScriptProxyReplacements(
  scriptBody: ArrayBuffer | undefined,
  definition: ScriptProxyDefinition,
): ArrayBuffer | undefined {
  if (!scriptBody || !definition.responseReplacements?.length) {
    return scriptBody;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let scriptText = decoder.decode(scriptBody);
  for (const replacement of definition.responseReplacements) {
    scriptText = scriptText.split(replacement.search).join(replacement.replace);
  }

  return encoder.encode(scriptText).buffer;
}

async function fetchSelectedScriptBody(
  definition: ScriptProxyDefinition,
  upstreamUrl: URL,
  options: ScriptProxyOptions,
): Promise<ArrayBuffer | undefined> {
  if (definition.fetchRuntime === "node") {
    const nodeFetch = options.nodeFetch ?? fetchSelectedScriptWithNode;
    return nodeFetch(upstreamUrl, defaultScriptProxyTimeoutMs);
  }

  return fetchSelectedScriptWithBun(upstreamUrl, defaultScriptProxyTimeoutMs);
}

async function fetchSelectedScriptWithBun(upstreamUrl: URL, timeoutMs: number): Promise<ArrayBuffer | undefined> {
  let upstreamResponse: Response;
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    upstreamResponse = await fetch(upstreamUrl, {
      credentials: "omit",
      headers: {
        Accept: "application/javascript,*/*;q=0.8",
      },
      signal: abortController.signal,
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }

  if (!upstreamResponse.ok) {
    return undefined;
  }

  try {
    return await upstreamResponse.arrayBuffer();
  } catch {
    return undefined;
  }
}

async function fetchSelectedScriptWithNode(upstreamUrl: URL, timeoutMs: number): Promise<ArrayBuffer | undefined> {
  let process: Bun.Subprocess<"pipe", "pipe", "ignore">;
  try {
    process = Bun.spawn(["node", "-e", nodeFetchScript, upstreamUrl.toString(), String(timeoutMs)], {
      stderr: "ignore",
      stdout: "pipe",
    });
  } catch {
    return undefined;
  }

  const [body, exitCode] = await Promise.all([new Response(process.stdout).arrayBuffer(), process.exited]);
  if (exitCode !== 0 || body.byteLength === 0) {
    return undefined;
  }

  return body;
}

function createScriptProxyFailureResponse(): Response {
  return new Response(scriptProxyFailureBody, {
    status: 502,
    headers: {
      "Cache-Control": "no-store",
      "Content-Length": String(new TextEncoder().encode(scriptProxyFailureBody).byteLength),
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
