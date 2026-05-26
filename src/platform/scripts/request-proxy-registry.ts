export type RequestProxyMethod = "GET" | "HEAD" | "POST";

export type RequestProxyAllowRule = {
  protocol: "https:";
  hostname?: string;
  hostnameSuffix?: string;
  pathPrefix?: string;
};

export type RequestProxyClientRewrite = {
  kind: "query_param";
  param: string;
};

export type RequestProxySpecialRoute = {
  route: string;
  upstreamOrigin: string;
  upstreamPath: string;
};

export type RequestProxyDefinition = {
  key: string;
  route: string;
  allow: readonly RequestProxyAllowRule[];
  allowedMethods: readonly RequestProxyMethod[];
  timeoutMs: number;
  clientRewrite: RequestProxyClientRewrite;
  specialRoutes?: readonly RequestProxySpecialRoute[];
};

export type RequestProxyDefinitionInput = Omit<RequestProxyDefinition, "key">;

export type RequestProxyRegistry = Readonly<Record<string, RequestProxyDefinition>>;

export type RequestProxyClientDefinition = Pick<
  RequestProxyDefinition,
  "key" | "route" | "allow" | "clientRewrite" | "specialRoutes"
>;

export type RequestProxyUrlResult =
  | {
      ok: true;
      url: URL;
    }
  | {
      ok: false;
      status: 400 | 404;
      message: string;
    };

const proxyKeyPattern = /^[a-z][a-zA-Z0-9]*$/u;
const routePattern = /^\/[A-Za-z0-9/_-]+$/u;
const clientRewriteParamPattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const allowedMethods = new Set<RequestProxyMethod>(["GET", "HEAD", "POST"]);

export function defineRequestProxyRegistry(
  definitions: Record<string, RequestProxyDefinitionInput>,
): RequestProxyRegistry {
  return Object.fromEntries(
    Object.entries(definitions).map(([key, definition]) => {
      assertValidRequestProxyKey(key);
      assertValidRequestProxyDefinition(key, definition);

      return [
        key,
        {
          ...definition,
          key,
          allow: definition.allow.map((rule) => ({ ...rule })),
          allowedMethods: [...definition.allowedMethods],
          clientRewrite: { ...definition.clientRewrite },
          specialRoutes: definition.specialRoutes?.map((route) => ({ ...route })),
        },
      ];
    }),
  );
}

export function getRequestProxyDefinition(
  registry: RequestProxyRegistry,
  proxyKey: string,
): RequestProxyDefinition | undefined {
  return registry[proxyKey];
}

export function getRequestProxyDefinitions(
  registry: RequestProxyRegistry,
): readonly RequestProxyDefinition[] {
  return Object.values(registry);
}

export function getRequestProxyClientDefinitions(
  registry: RequestProxyRegistry,
  proxyKeys: readonly string[],
): readonly RequestProxyClientDefinition[] {
  return proxyKeys.map((proxyKey) => {
    const definition = getRequestProxyDefinition(registry, proxyKey);
    if (!definition) {
      throw new Error(`Unknown request proxy "${proxyKey}".`);
    }

    return {
      key: definition.key,
      route: definition.route,
      allow: definition.allow.map((rule) => ({ ...rule })),
      clientRewrite: { ...definition.clientRewrite },
      specialRoutes: definition.specialRoutes?.map((route) => ({ ...route })),
    };
  });
}

export function buildRequestProxyUpstreamUrl(
  definition: RequestProxyDefinition,
  requestUrl: URL,
): RequestProxyUrlResult {
  const target = requestUrl.searchParams.get(definition.clientRewrite.param);
  if (!target) {
    return { ok: false, status: 400, message: "Missing target URL." };
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return { ok: false, status: 400, message: "Invalid target URL." };
  }

  if (!isRequestProxyUrlAllowed(definition, upstreamUrl)) {
    return { ok: false, status: 400, message: "Target URL is not allowlisted." };
  }

  return { ok: true, url: upstreamUrl };
}

export function buildRequestProxySpecialRouteUpstreamUrl(
  definition: RequestProxyDefinition,
  specialRoute: RequestProxySpecialRoute,
  requestUrl: URL,
): RequestProxyUrlResult {
  const upstreamUrl = new URL(specialRoute.upstreamOrigin);
  const suffix = requestUrl.pathname.slice(specialRoute.route.length);
  upstreamUrl.pathname = `${specialRoute.upstreamPath}${suffix}`;
  upstreamUrl.search = requestUrl.search;

  if (!isRequestProxyUrlAllowed(definition, upstreamUrl)) {
    return { ok: false, status: 400, message: "Target URL is not allowlisted." };
  }

  return { ok: true, url: upstreamUrl };
}

export function isRequestProxyMethodAllowed(
  definition: RequestProxyDefinition,
  method: string,
): boolean {
  return definition.allowedMethods.includes(method as RequestProxyMethod);
}

export function isRequestProxyUrlAllowed(definition: RequestProxyDefinition, url: URL): boolean {
  return definition.allow.some((rule) => isUrlAllowedByRule(rule, url));
}

function assertValidRequestProxyKey(key: string): void {
  if (!proxyKeyPattern.test(key)) {
    throw new Error(`Request proxy key "${key}" must be a static camelCase key.`);
  }
}

function assertValidRequestProxyDefinition(key: string, definition: RequestProxyDefinitionInput): void {
  assertValidStaticRoute(definition.route, `Request proxy "${key}" route`);
  if (!definition.allow.length) {
    throw new Error(`Request proxy "${key}" must include at least one allow rule.`);
  }
  definition.allow.forEach((rule, index) => assertValidAllowRule(key, rule, index));

  if (!definition.allowedMethods.length) {
    throw new Error(`Request proxy "${key}" must include at least one allowed method.`);
  }
  definition.allowedMethods.forEach((method) => {
    if (!allowedMethods.has(method)) {
      throw new Error(`Request proxy "${key}" method "${method}" is not supported.`);
    }
  });

  if (!Number.isFinite(definition.timeoutMs) || definition.timeoutMs <= 0) {
    throw new Error(`Request proxy "${key}" timeoutMs must be a finite positive number.`);
  }

  if (definition.clientRewrite.kind !== "query_param") {
    throw new Error(`Request proxy "${key}" clientRewrite.kind must be "query_param".`);
  }
  if (!clientRewriteParamPattern.test(definition.clientRewrite.param)) {
    throw new Error(`Request proxy "${key}" clientRewrite.param must be a static query parameter name.`);
  }

  definition.specialRoutes?.forEach((specialRoute, index) => {
    assertValidStaticRoute(specialRoute.route, `Request proxy "${key}" special route ${index}`);
    const upstreamOrigin = new URL(specialRoute.upstreamOrigin);
    if (upstreamOrigin.protocol !== "https:" || upstreamOrigin.pathname !== "/" || upstreamOrigin.search || upstreamOrigin.hash) {
      throw new Error(`Request proxy "${key}" special route ${index} must use an HTTPS upstream origin.`);
    }
    assertValidStaticRoute(specialRoute.upstreamPath, `Request proxy "${key}" special route ${index} upstreamPath`);
  });
}

function assertValidStaticRoute(route: string, label: string): void {
  if (!routePattern.test(route)) {
    throw new Error(`${label} must be a static absolute route.`);
  }
}

function assertValidAllowRule(key: string, rule: RequestProxyAllowRule, index: number): void {
  if (rule.protocol !== "https:") {
    throw new Error(`Request proxy "${key}" allow rule ${index} must use HTTPS.`);
  }

  if (!rule.hostname && !rule.hostnameSuffix) {
    throw new Error(`Request proxy "${key}" allow rule ${index} must include hostname or hostnameSuffix.`);
  }

  if (rule.hostname && !isSafeHostname(rule.hostname)) {
    throw new Error(`Request proxy "${key}" allow rule ${index} has an unsafe hostname.`);
  }

  if (rule.hostnameSuffix && (!rule.hostnameSuffix.startsWith(".") || !isSafeHostname(rule.hostnameSuffix.slice(1)))) {
    throw new Error(`Request proxy "${key}" allow rule ${index} has an unsafe hostname suffix.`);
  }

  if (rule.pathPrefix !== undefined && (!rule.pathPrefix.startsWith("/") || rule.pathPrefix.includes(".."))) {
    throw new Error(`Request proxy "${key}" allow rule ${index} has an unsafe path prefix.`);
  }
}

function isSafeHostname(hostname: string): boolean {
  return /^[a-z0-9.-]+$/iu.test(hostname) && !hostname.includes("..") && !hostname.startsWith(".") && !hostname.endsWith(".");
}

function isUrlAllowedByRule(rule: RequestProxyAllowRule, url: URL): boolean {
  if (url.protocol !== rule.protocol) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const matchesHost =
    (rule.hostname ? hostname === rule.hostname.toLowerCase() : false) ||
    (rule.hostnameSuffix ? hostname.endsWith(rule.hostnameSuffix.toLowerCase()) : false);
  if (!matchesHost) {
    return false;
  }

  return rule.pathPrefix ? url.pathname.startsWith(rule.pathPrefix) : true;
}
