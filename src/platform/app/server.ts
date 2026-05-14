import { Hono } from "hono";

import { renderUnavailablePage } from "../rendering";
import { htmlResponse } from "./http/responses";
import { registerAssetRoutes } from "./routes/assets";
import { registerFormRoutes, type SubmissionLogger } from "./routes/forms";
import { registerPreviewRoutes } from "./routes/preview";

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
  registerPreviewRoutes(app);
  registerFormRoutes(app, logger);

  app.notFound(() => htmlResponse(renderUnavailablePage("esta ruta"), 404));

  return app;
}
