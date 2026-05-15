export type ScriptProxyDefinition = {
  key: string;
  upstreamUrl: string;
  allowedQueryParams: readonly string[];
  queryAliases?: Readonly<Record<string, string>>;
  cacheControl?: string;
  fetchRuntime?: "bun" | "node";
  responseReplacements?: readonly ScriptProxyReplacement[];
};

export type ScriptProxyReplacement = {
  search: string;
  replace: string;
};

export type ScriptProxyDefinitionInput = Omit<ScriptProxyDefinition, "key">;

export type ScriptProxyRegistry = Readonly<Record<string, ScriptProxyDefinition>>;

export type ScriptProxyUrlResult =
  | {
      ok: true;
      url: URL;
    }
  | {
      ok: false;
      status: 400 | 404;
      message: string;
    };

const scriptKeyPattern = /^[a-z0-9][a-z0-9-]*$/u;

export function defineScriptProxyRegistry(
  definitions: Record<string, ScriptProxyDefinitionInput>,
): ScriptProxyRegistry {
  return Object.fromEntries(
    Object.entries(definitions).map(([key, definition]) => {
      assertValidScriptProxyKey(key);
      assertValidUpstreamUrl(definition.upstreamUrl, key);

      return [
        key,
        {
          ...definition,
          key,
          allowedQueryParams: [...definition.allowedQueryParams],
          queryAliases: { ...(definition.queryAliases ?? {}) },
        },
      ];
    }),
  );
}

export function getScriptProxyDefinition(
  registry: ScriptProxyRegistry,
  scriptKey: string,
): ScriptProxyDefinition | undefined {
  return registry[scriptKey];
}

export function buildScriptProxyUpstreamUrl(
  definition: ScriptProxyDefinition,
  requestUrl: URL,
): ScriptProxyUrlResult {
  const upstreamUrl = new URL(definition.upstreamUrl);
  const allowedParams = new Set(definition.allowedQueryParams);
  const aliases = definition.queryAliases ?? {};

  for (const [paramName, paramValue] of requestUrl.searchParams.entries()) {
    const upstreamParamName = aliases[paramName] ?? paramName;
    if (!allowedParams.has(upstreamParamName)) {
      return {
        ok: false,
        status: 400,
        message: `Query parameter "${paramName}" is not allowed for script "${definition.key}".`,
      };
    }

    upstreamUrl.searchParams.append(upstreamParamName, paramValue);
  }

  return { ok: true, url: upstreamUrl };
}

export function getScriptProxyPublicPath(scriptKey: string): string {
  assertValidScriptProxyKey(scriptKey);
  return `/_instant/scripts/${scriptKey}.js`;
}

function assertValidScriptProxyKey(key: string): void {
  if (!scriptKeyPattern.test(key)) {
    throw new Error(`Script proxy key "${key}" must be a lowercase static script key.`);
  }
}

function assertValidUpstreamUrl(upstreamUrl: string, key: string): void {
  const url = new URL(upstreamUrl);
  if (url.protocol !== "https:") {
    throw new Error(`Script proxy "${key}" must use an HTTPS upstream URL.`);
  }
}
