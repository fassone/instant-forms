import { describe, expect, it } from "bun:test";
import { Hono } from "hono";

import { defaultAutoInsuranceVariables } from "../../src/authoring/flows/auto/shared";
import { defaultHomeInsuranceVariables } from "../../src/authoring/flows/home/shared";
import { esAutoInsuranceTemplate, esGenericAutoInsuranceTemplate } from "../../src/authoring/templates/es-auto-insurance";
import { esHomeInsuranceTemplate, esGenericHomeInsuranceTemplate } from "../../src/authoring/templates/es-home-insurance";
import { registerFormRoutes } from "../../src/platform/app/routes/forms";
import { createFetchHandler } from "../../src/platform/app/server";
import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";
import { defineFormRoutes, redirectTo, registerFormRoutePages, unavailable } from "../../src/platform/routing";

const pixelId = "1234567890";
const cert = "https://cert.trustedform.com/454a35b802f3e7b63ffabb4efedb7c6ebe67886c";
const contact = { first_name: "Ana", last_name: "Lopez", phone_number: "(615) 555-1234" };
const autoAnswers = {
  welcome_started: "started", belongs_to_state: "yes", residence_state: "TN",
  has_license: "yes", has_insurance: "no", is_clean_title: "yes", number_of_registered_cars: "1", ...contact,
};
const homeAnswers = {
  welcome_started: "started", property_in_state: "yes", property_state: "TX",
  ownership_status: "rent", property_type: "condo", property_use: "primary_residence",
  has_home_insurance: "no", house_age_years: "21_plus", roof_age_years: "6_10", ...contact,
};

function fixture(product: "auto" | "home", generic: boolean, postHog: boolean, capi = false) {
  const shared = {
    flowName: "Tracking delivery fixture",
    gtmContainerId: undefined,
    metaPixelId: generic ? undefined : pixelId,
    metaTestEventCode: "TEST_CONVERSION",
    metaConversionsAccessToken: capi ? "explicit-token" : undefined,
    postHogProjectApiKey: postHog ? "phc_test" : undefined,
    postHogApiHost: "https://posthog.example.test",
  } as const;
  if (product === "auto") {
    const variables = { ...defaultAutoInsuranceVariables, ...shared };
    return generic
      ? esGenericAutoInsuranceTemplate.create(variables)
      : esAutoInsuranceTemplate.create({ ...variables, areaCode: "TN", areaName: "Tennessee" });
  }
  const variables = { ...defaultHomeInsuranceVariables, ...shared };
  return generic
    ? esGenericHomeInsuranceTemplate.create(variables)
    : esHomeInsuranceTemplate.create({ ...variables, areaCode: "TX", areaName: "Texas" });
}

describe("tracking delivery without GTM", () => {
  it("preserves attribution from shared entry through native submission without inferring paid traffic", async () => {
    for (const scenario of [
      { query: "?fbclid=NEW&source_channel=facebook&acquisition_channel=paid&platform=meta", saved: true,
        expected: { source_channel: "facebook", acquisition_channel: "paid", platform: "meta" } },
      { query: "?source_channel=new-source", saved: true,
        expected: { source_channel: "new-source", acquisition_channel: "paid", platform: "saved-platform" } },
      { query: "", saved: true,
        expected: { source_channel: "saved-source", acquisition_channel: "paid", platform: "saved-platform" } },
      { query: "?fbclid=CLICK_ONLY&utm_source=facebook", saved: false,
        expected: { source_channel: "unknown", acquisition_channel: "organic" } },
    ]) {
      const deliveries: any[] = [];
      const handler = createFetchHandler({ delivery: { fetch: async (_url, init) => {
        deliveries.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      } } });
      const cookies = new Map<string, string>(scenario.saved ? [
        ["liderna_source_channel", "saved-source"], ["liderna_acquisition_channel", "paid"],
        ["liderna_platform", "saved-platform"], ["_fbc", "fb.1.1.OLD"], ["_fbp", "fb.1.1.OLD_BROWSER"],
      ] : []);
      async function request(path: string, init?: RequestInit) {
        const response = await handler(new Request("https://forms.example.test" + path, {
          ...init, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
        }));
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(";")[0]!;
          const index = pair.indexOf("=");
          cookies.set(pair.slice(0, index), pair.slice(index + 1));
        }
        return response;
      }
      const welcome = await request("/" + scenario.query);
      expect(await welcome.text()).toContain("/producto");
      const selected = await request("/producto" + scenario.query, { method: "POST", body: new URLSearchParams({ product: "auto" }) });
      const redirect = await request(selected.headers.get("Location")!);
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get("Location")).not.toContain("utm_source");
      const page = await request(redirect.headers.get("Location")!);
      expect(page.status).toBe(200);
      if (scenario.query.includes("fbclid=")) {
        expect(cookies.get("_fbc")).toMatch(scenario.saved ? /\.NEW$/u : /\.CLICK_ONLY$/u);
      } else {
        expect(cookies.get("_fbc")).toBe("fb.1.1.OLD");
      }
      if (scenario.saved) expect(cookies.get("_fbp")).toBe("fb.1.1.OLD_BROWSER");
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(autoAnswers)) body.set(`answers[${key}]`, value);
      body.set("answers[trustedform_consent][accepted]", "accepted");
      body.set("answers[trustedform_consent][trustedform_certificate_url]", cert);
      body.set("xxTrustedFormCertUrl", cert);
      const response = await request("/api/forms/auto/native-submissions", { method: "POST", body });
      expect(response.status).toBe(303);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({ ...scenario.expected, meta_conversion: { enabled: false } });
      if (!scenario.saved) expect(deliveries[0]).not.toHaveProperty("platform");
    }
  });

  it("does not opt current flows into GTM or CAPI even with a token in the environment", () => {
    const result = Bun.spawnSync([process.execPath, "-e", `
      import { formRoutes } from './src/authoring/routes/registry';
      import { getFormRouteBuildEntries } from './src/platform/routing';
      const entries = getFormRouteBuildEntries(formRoutes);
      if (entries.length !== 12) throw new Error('Unexpected flow count');
      for (const { form } of entries) {
        if (form.tracking?.googleTagManager) throw new Error('GTM enabled');
        if (form.tracking?.events?.some(event => event.server)) throw new Error('CAPI enabled from env');
      }
    `], { env: {
      ...process.env, NODE_ENV: "production", POSTHOG_PROJECT_API_KEY: "", META_CONVERSIONS_ACCESS_TOKEN: "must-not-enable-capi",
      LIDERNA_WEBLEADS_SUBMISSION_URL: "https://example.test/leads",
    } });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  });

  for (const product of ["auto", "home"] as const) {
    it(`${product}: still permits explicit direct CAPI opt-in alongside PostHog`, async () => {
      const originalFetch = globalThis.fetch;
      const calls: Array<{ url: string; body: any }> = [];
      globalThis.fetch = (async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Response.json({});
      }) as typeof fetch;
      try {
        const routes = defineFormRoutes({
          index: redirectTo("/test"), folders: { test: fixture(product, false, true, true) },
          notFound: unavailable({ locale: "es", title: "404", message: "Not found", status: 404 }),
        });
        const app = new Hono();
        registerFormRoutes(app, routes, () => {});
        const response = await app.fetch(new Request("https://forms.example.test/api/forms/test/checkpoints", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionKey: "welcome_started", answer: "started" }),
        }));
        expect(response.status).toBe(200);
        await Bun.sleep(10);
        expect(calls).toHaveLength(2);
        const meta = calls.find((call) => call.url.includes("graph.facebook.com"));
        expect(meta?.body).toMatchObject({ access_token: "explicit-token", data: [{ event_name: "LeadProgress" }] });
        expect(calls.find((call) => call.url.includes("posthog"))?.body.event).toBe("instant_form_step_answer");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    for (const generic of [false, true]) {
      for (const postHog of [false, true]) {
        it(`${product} ${generic ? "generic" : "state"}: preserves conversion data with PostHog ${postHog ? "on" : "off"}`, async () => {
          const form = fixture(product, generic, postHog);
          const answers = product === "auto" ? autoAnswers : homeAnswers;
          const calls: Array<{ url: string; body: any }> = [];
          const deliveries: any[] = [];
          const originalFetch = globalThis.fetch;
          globalThis.fetch = (async (url, init) => {
            calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
            return Response.json({});
          }) as typeof fetch;

          try {
            const routes = defineFormRoutes({
              index: redirectTo("/test"), folders: { test: form },
              notFound: unavailable({ locale: "es", title: "404", message: "Not found", status: 404 }),
            });
            const app = new Hono();
            registerFormRoutePages(app, routes);
            registerFormRoutes(app, routes, () => {}, { fetch: (async (_url, init) => {
              deliveries.push(JSON.parse(String(init?.body)));
              return Response.json({ ok: true });
            }) as typeof fetch });
            const cookies = new Map<string, string>([
              ["_fbp", "fb.1.1.saved-browser"], ["_fbc", "fb.1.1.saved-click"],
              ["liderna_source_channel", "facebook"], ["liderna_acquisition_channel", "paid"], ["liderna_platform", "meta"],
            ]);
            async function request(path: string, init?: RequestInit) {
              const response = await app.fetch(new Request("https://forms.example.test" + path, {
                ...init,
                headers: {
                  Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
                  "User-Agent": "Tracking Test Browser", "X-Forwarded-For": "203.0.113.1",
                  ...init?.headers,
                },
              }));
              for (const cookie of response.headers.getSetCookie()) {
                const pair = cookie.split(";")[0]!;
                const index = pair.indexOf("=");
                cookies.set(pair.slice(0, index), pair.slice(index + 1));
              }
              return response;
            }
            async function track(body: unknown) {
              const response = await request("/api/forms/test/tracking-events", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
              });
              expect(response.status).toBe(200);
            }

            const page = await request("/test/inicio");
            const html = await page.text();
            expect(page.status).toBe(200);
            expect(html).not.toContain('googleTagScript.type = "text/partytown"');
            expect(html).not.toContain("window.dataLayer = window.dataLayer || []");
            const config = JSON.parse(html.match(/window\.__FORM_CONFIG__\s*=\s*(\{.*?\});(?:\s|<)/su)![1]!);
            expect(config.tracking?.googleTagManager).toBeUndefined();
            if (!generic) {
              expect(config.tracking.events.stepAnswer.meta.pixelId).toBe(pixelId);
            }
            if (postHog) {
              expect(config.tracking.events.stepAnswer.server).toBe(true);
              expect(config.tracking.serverEvents).toMatchObject({ postHogPageView: true, postHogPageLeave: true });
            } else {
              expect(config.tracking?.events.stepAnswer.server).toBeUndefined();
              expect(config.tracking?.serverEvents).toBeUndefined();
            }
            const checkpoint = await request("/api/forms/test/checkpoints", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questionKey: "welcome_started", answer: "started" }),
            });
            expect(checkpoint.status).toBe(200);
            const firstQuestion = form.steps[1]!;
            await track({ eventKinds: ["stepView", "postHogPageView"], stepKey: firstQuestion.key,
              currentUrl: `https://forms.example.test/test/${firstQuestion.slug}` });
            await track({ eventKind: "postHogPageLeave", stepKey: firstQuestion.key,
              currentUrl: `https://forms.example.test/test/${firstQuestion.slug}`,
              leaveReason: "step_transition", durationMs: 500 });

            cookies.set(getCheckpointCookieName("test"), encodeCheckpointAnswers(answers));
            await track({ eventKind: "trustedFormSubstepView", stepKey: "trustedform_consent", trustedFormSubstep: "consent" });
            const body = new URLSearchParams();
            for (const [key, value] of Object.entries(answers)) body.set(`answers[${key}]`, value);
            body.set("answers[trustedform_consent][accepted]", "accepted");
            body.set("answers[trustedform_consent][trustedform_certificate_url]", cert);
            body.set("xxTrustedFormCertUrl", cert);
            body.set("tracking[eventSourceUrl]", "https://forms.example.test/test/consentimiento");
            const submission = await request("/api/forms/test/native-submissions", { method: "POST", body });
            expect(submission.status).toBe(303);
            await Bun.sleep(10);

            expect(deliveries).toHaveLength(1);
            expect(deliveries[0]).toMatchObject({ source_channel: "facebook", acquisition_channel: "paid", platform: "meta" });
            expect(deliveries[0].meta_conversion).toEqual(generic ? { enabled: false } : {
              enabled: true, pixel_id: pixelId, event_name: "Lead", event_id: deliveries[0].id,
              event_source_url: "https://forms.example.test/test/consentimiento",
              client_ip_address: "203.0.113.1", client_user_agent: "Tracking Test Browser",
              fbp: "fb.1.1.saved-browser", fbc: "fb.1.1.saved-click", test_event_code: "TEST_CONVERSION",
            });
            expect(JSON.stringify(deliveries)).not.toContain("access_token");
            expect(calls.every((call) => call.url === "https://posthog.example.test/i/v0/e/")).toBe(true);
            if (!postHog) {
              expect(calls).toEqual([]);
            } else {
              expect(new Set(calls.map((call) => call.body.event))).toEqual(new Set([
                "instant_form_view", "instant_form_step_view", "instant_form_step_answer",
                "instant_form_trusted_form_substep_view", "instant_form_submit_success", "$pageview", "$pageleave",
              ]));
              expect(new Set(calls.map((call) => call.body.distinct_id)).size).toBe(1);
              expect(new Set(calls.map((call) => call.body.properties.$session_id)).size).toBe(1);
              for (const { body: event } of calls) {
                expect(event.distinct_id).toMatch(/^[A-Za-z0-9]{24}$/u);
                expect(event.properties.$session_id).toBeTruthy();
                expect(event.properties).not.toHaveProperty("$process_person_profile");
              }
              expect(calls.find((call) => call.body.event === "instant_form_step_answer")?.body.properties.answer_value).toBe("started");
              const analytics = JSON.stringify(calls);
              for (const value of ["Ana", "Lopez", "6155551234", cert, "saved-browser", "saved-click", "access_token"]) {
                expect(analytics).not.toContain(value);
              }
            }
          } finally {
            globalThis.fetch = originalFetch;
          }
        });
      }
    }
  }
});
