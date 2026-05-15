import type { Hono } from "hono";
import path from "node:path";

import { assetResponse } from "../http/responses";
import { DIST_FORMS_ROOT } from "../../rendering";

const logoAssetUrl = new URL("../../../shared/assets/logo.webp", import.meta.url);

export function registerAssetRoutes(app: Hono): void {
  app.get("/assets/logo.webp", () => assetResponse(Bun.file(logoAssetUrl), "image/webp"));
  app.get("/_instant/forms/:hash/transition.js", async (c) => {
    const hash = c.req.param("hash");

    if (!/^[a-f0-9]{16}$/u.test(hash)) {
      return new Response("Not found", { status: 404 });
    }

    const bundleFile = Bun.file(path.join(process.cwd(), DIST_FORMS_ROOT, "_instant", "forms", hash, "transition.js"));

    if (!(await bundleFile.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return assetResponse(bundleFile, "application/javascript; charset=utf-8");
  });
}
