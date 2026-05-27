import { Hono } from "hono";

import { requestProxies } from "../../authoring/proxies/registry";
import { selectedScripts } from "../../authoring/scripts/registry";
import { formRoutes } from "../../authoring/routes/registry";
import { registerFormRoutePages, renderFormRouteNotFound } from "../routing";
import { registerAssetRoutes } from "./routes/assets";
import { registerFormRoutes, type SubmissionLogger } from "./routes/forms";
import { registerScriptRoutes } from "./routes/scripts";
import type { DeliveryOptions } from "../submissions/delivery";
import { assignRequestId, type InstantFormLogger } from "../logging";

export type { SubmissionLogger };

export type AppOptions = {
  logger?: SubmissionLogger;
  delivery?: DeliveryOptions;
  eventLogger?: InstantFormLogger;
};

export function createFetchHandler(options: AppOptions = {}) {
  const app = createApp(options);

  return (request: Request): Promise<Response> | Response => app.fetch(request);
}

export function createApp(options: AppOptions = {}) {
  const logger = options.logger ?? (() => undefined);
  const app = new Hono();

  app.use("*", async (c, next) => {
    const requestId = assignRequestId(c.req.raw);
    c.header("X-Request-Id", requestId);
    await next();
    c.res.headers.set("X-Request-Id", requestId);
  });

  registerAssetRoutes(app);
  registerScriptRoutes(app, selectedScripts, requestProxies, options.eventLogger);
  registerFormRoutePages(app, formRoutes, options.eventLogger);
  registerFormRoutes(app, formRoutes, logger, options.delivery, options.eventLogger);

  app.notFound((c) => renderFormRouteNotFound(c, formRoutes));

  return app;
}
