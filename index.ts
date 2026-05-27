import { createFetchHandler } from "./src/platform/app/server";
import { createJsonStdoutLogger } from "./src/platform/logging";

const port = Number(Bun.env.PORT ?? 3000);
const eventLogger = createJsonStdoutLogger();

const server = Bun.serve({
  port,
  fetch: createFetchHandler({
    eventLogger,
    logger: (payload) => {
      eventLogger({
        level: "info",
        event: "submission.logged",
        routeKey: payload.routeKey,
        formName: payload.formName,
        pageName: payload.pageName,
        submissionId: payload.submissionId,
        data: payload,
      });
    },
  }),
});

console.log(`Instant Forms running at http://localhost:${server.port}`);
