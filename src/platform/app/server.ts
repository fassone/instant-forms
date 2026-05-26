import { Hono } from "hono";

import { requestProxies } from "../../authoring/proxies/registry";
import { selectedScripts } from "../../authoring/scripts/registry";
import { formRoutes } from "../../authoring/routes/registry";
import { registerFormRoutePages, renderFormRouteNotFound } from "../routing";
import { registerAssetRoutes } from "./routes/assets";
import { registerFormRoutes, type SubmissionLogger } from "./routes/forms";
import { registerScriptRoutes } from "./routes/scripts";

export type { SubmissionLogger };

export type AppOptions = {
  logger?: SubmissionLogger;
};

export function createFetchHandler(options: AppOptions = {}) {
  const app = createApp(options);

  return (request: Request): Promise<Response> | Response => app.fetch(request);
}

export function createApp(options: AppOptions = {}) {
  const logger = options.logger ?? (() => undefined);
  const app = new Hono();

  registerAssetRoutes(app);
  registerScriptRoutes(app, selectedScripts, requestProxies);
  registerFormRoutePages(app, formRoutes);
  registerFormRoutes(app, formRoutes, logger);

  app.notFound((c) => renderFormRouteNotFound(c, formRoutes));

  return app;
}
