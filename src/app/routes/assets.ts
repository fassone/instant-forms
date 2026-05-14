import type { Hono } from "hono";

import { assetResponse } from "../http/responses";

const logoAssetUrl = new URL("../../assets/logo.webp", import.meta.url);

export function registerAssetRoutes(app: Hono): void {
  app.get("/assets/logo.webp", () => assetResponse(Bun.file(logoAssetUrl), "image/webp"));
}
