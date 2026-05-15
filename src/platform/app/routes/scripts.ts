import type { Hono } from "hono";

import type { ScriptProxyRegistry } from "../../scripts";
import { getPartytownAssetPath, proxySelectedScript } from "../../scripts";

export function registerScriptRoutes(app: Hono, registry: ScriptProxyRegistry): void {
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
