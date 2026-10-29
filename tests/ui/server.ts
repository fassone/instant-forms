// Test-only entrypoint: never load real analytics credentials or send real leads.
process.env.LIDERNA_WEBLEADS_SUBMISSION_URL = "https://example.test/leads";
process.env.POSTHOG_PROJECT_API_KEY = "phc_browser_test";
process.env.POSTHOG_API_HOST = "https://posthog.example.test";
process.env.META_CONVERSIONS_ACCESS_TOKEN = "must-not-enable-capi";
delete process.env.META_TEST_EVENT_CODE;

const { Hono } = await import("hono");
const { createApp } = await import("../../src/platform/app/server");
const { createAutoInsuranceFlow } = await import("../../src/authoring/flows/auto/shared");
const { defineFormRoutes, getFormRouteBuildEntries, getFormRouteStepUrlOverrides, redirectTo, registerFormRoutePages, unavailable } = await import("../../src/platform/routing");
const { registerFormRoutes } = await import("../../src/platform/app/routes/forms");

const calls: Array<{ url: string; body: any }> = [];
globalThis.fetch = (async (url, init) => {
  calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
  return Response.json({ ok: true });
}) as typeof fetch;

const delivery = { fetch: async () => Response.json({ ok: true }) };
const app = createApp({ delivery });
const fixtures = new Hono();
const routes = defineFormRoutes({
  index: redirectTo("/test-gtm/inicio"),
  folders: {
    "test-gtm": createAutoInsuranceFlow({
      flowName: "Explicit GTM opt-in", areaCode: "TN", areaName: "Tennessee", gtmContainerId: "GTM-MVJNX5DZ", postHogProjectApiKey: undefined,
    }),
    "test-meta": createAutoInsuranceFlow({
      flowName: "Meta identifiers only", areaCode: "TN", areaName: "Tennessee", metaPixelId: "1234567890", postHogProjectApiKey: undefined,
    }),
  },
  notFound: unavailable({ locale: "es", title: "404", message: "Not found", status: 404 }),
});

// Match the deployed build + request-time config injection for test-only flows too.
if (process.env.NODE_ENV === "production") {
  const { renderFormPage, FORM_CONFIG_PLACEHOLDER_EXPRESSION, getPrebuiltFormStepHtmlPath } = await import("../../src/platform/rendering");
  for (const entry of getFormRouteBuildEntries(routes)) {
    for (const [activeStepIndex, step] of entry.form.steps.entries()) {
      const html = await renderFormPage(entry.form, {
        activeStepIndex, routeKey: entry.routeKey,
        stepUrlOverrides: getFormRouteStepUrlOverrides(entry.routeSegments, entry.form),
        formConfigExpression: FORM_CONFIG_PLACEHOLDER_EXPRESSION,
      });
      await Bun.write(getPrebuiltFormStepHtmlPath(entry.routeSegments, step.slug), html);
    }
  }
}
registerFormRoutePages(fixtures, routes);
registerFormRoutes(fixtures, routes, () => {}, delivery);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 51234),
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/__test/tracking") {
      const visitor = url.searchParams.get("visitor");
      return Response.json(calls.filter((call) => call.body?.distinct_id === visitor || call.url.includes("graph.facebook.com")));
    }
    if (/^\/(?:test-(?:gtm|meta)(?:\/|$)|api\/forms\/test-(?:gtm|meta)\/)/u.test(url.pathname)) {
      return fixtures.fetch(request);
    }
    return app.fetch(request);
  },
});
console.log(`Mocked UI server listening on ${server.url}`);

export {};
