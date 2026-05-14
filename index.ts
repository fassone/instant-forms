import { createFetchHandler } from "./src/app/server";

const port = Number(Bun.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch: createFetchHandler({
    logger: (payload) => {
      console.log("instant-form-submission", JSON.stringify(payload));
    },
  }),
});

console.log(`Instant Forms running at http://localhost:${server.port}`);
