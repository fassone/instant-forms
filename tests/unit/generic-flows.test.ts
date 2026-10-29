import { describe, expect, it } from "bun:test";
import { createFetchHandler } from "../../src/platform/app/server";
import { genericAutoFlow, genericHomeFlow } from "../../src/authoring/flows/generic";
import { formRoutes } from "../../src/authoring/routes/registry";
import { esGenericAutoInsuranceTemplate } from "../../src/authoring/templates/es-auto-insurance";
import { defaultAutoInsuranceVariables } from "../../src/authoring/flows/auto/shared";
import { defineFormRoutes, getFormRouteBuildEntries, getFormRouteStepUrlOverrides } from "../../src/platform/routing";
import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";
import { getPostSubmitCookieName } from "../../src/platform/persistence/cookie-names";
import { validateSubmission } from "../../src/platform/submissions/validation";
import { renderFormPage, FORM_CONFIG_PLACEHOLDER_EXPRESSION } from "../../src/platform/rendering";
import { injectPrebuiltFormRequestState } from "../../src/platform/rendering/prebuilt-pages";

const started = { welcome_started: "started" };
const contact = { first_name: "Ana", last_name: "Lopez", phone_number: "(615) 555-1234" };
const autoAnswers = {
  ...started, ...contact, residence_state: "FL", has_license: "yes",
  has_insurance: "no", is_clean_title: "yes", number_of_registered_cars: "1",
};
const homeAnswers = {
  ...started, ...contact, property_state: "CA", ownership_status: "rent",
  property_type: "condo", property_use: "primary_residence",
  has_home_insurance: "no", house_age_years: "21_plus", roof_age_years: "6_10",
};

function cookie(routeKey: string, answers: Record<string, string>) {
  return getCheckpointCookieName(routeKey) + "=" + encodeCheckpointAnswers(answers);
}

function config(html: string) {
  const match = html.match(/window\.__FORM_CONFIG__\s*=\s*(\{.*?\});(?:\s|<)/su);
  if (!match?.[1]) throw new Error("Missing form configuration");
  return JSON.parse(match[1]);
}

describe("independent generic quote flows", () => {
  it("rejects conflicting group children and prefill mappings outside autocomplete steps", () => {
    for (const slug of ["inicio", "gracias"]) {
      expect(() => defineFormRoutes({
        index: formRoutes.index, notFound: formRoutes.notFound,
        folders: { auto: { index: genericAutoFlow, [slug]: genericHomeFlow } },
      })).toThrow("conflicts with its index flow");
    }
    expect(() => defineFormRoutes({
      index: formRoutes.index, notFound: formRoutes.notFound,
      folders: { auto: { index: genericAutoFlow, queryPrefill: { state: "first_name" } } },
    })).toThrow("Query prefill must reference an autocomplete step");
  });

  it("builds generic flows alongside all existing state flows with separate identities", () => {
    const entries = getFormRouteBuildEntries(formRoutes);
    expect(entries).toHaveLength(12);
    expect(entries.find((entry) => entry.routeKey === "auto")?.form).toBe(genericAutoFlow);
    expect(entries.find((entry) => entry.routeKey === "hogar")?.form).toBe(genericHomeFlow);
    expect(getCheckpointCookieName("auto")).not.toBe(getCheckpointCookieName("auto_tn"));
    expect(getPostSubmitCookieName("hogar")).not.toBe(getPostSubmitCookieName("hogar_tx"));
    for (const form of [genericAutoFlow, genericHomeFlow]) {
      expect(form.context.areaCode).toBeUndefined();
      expect(form.page.presentation?.showAreaBadge).toBe(false);
      expect(form.steps[1]?.kind).toBe("autocomplete");
      expect(form.steps[1]?.showWhen).toBeUndefined();
      expect(form.steps.some((step) => step.key === "belongs_to_state" || step.key === "property_in_state")).toBe(false);
    }
  });

  it("renders a single-CTA welcome at / and an auto-advancing selector at /producto", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/"));
    const welcomeHtml = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(welcomeHtml).toContain("Seguro claro, rápido y en español");
    expect(welcomeHtml).toContain('class="welcome-benefits"');
    expect(welcomeHtml).toContain('href="/producto"');
    expect(welcomeHtml).not.toContain('name="product"');
    expect(welcomeHtml).not.toContain('id="back-button"');
    expect(welcomeHtml).not.toContain('class="area-pill"');
    expect(welcomeHtml).not.toContain("data-product-selection");
    expect(welcomeHtml).not.toContain("requestSubmit");
    const selection = await handler(new Request("http://localhost/producto"));
    const html = await selection.text();
    expect(selection.status).toBe(200);
    expect(selection.headers.get("Cache-Control")).toBe("no-store");
    expect(html).toContain("¿Qué desea asegurar?");
    expect(html).toContain('method="post" action="/producto" data-product-selection');
    expect(html).toContain('value="auto" required');
    expect(html).toContain('value="hogar" required');
    expect(html).toContain("form.requestSubmit()");
    expect(html).toContain('addEventListener("pageshow"');
    expect(html).toContain('type="submit">Continuar</button>');
    expect(html).not.toContain("/cotizar");
    const preview = await handler(new Request("http://localhost/__preview/producto"));
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain('action="/producto"');
  });

  it("removes the cotizar routes entirely without compatibility redirects", async () => {
    const handler = createFetchHandler();
    for (const method of ["GET", "POST"]) {
      for (const path of ["/cotizar", "/cotizar/", "/cotizar/producto", "/cotizar/producto/", "/__preview/cotizar/producto"]) {
        const response = await handler(new Request("http://localhost" + path, { method }));
        expect(response.status).toBe(404);
        expect(response.headers.get("Location")).toBeNull();
        expect(response.headers.get("Set-Cookie")).toBeNull();
      }
    }
  });

  it("confirms the shared welcome only for the selected product and preserves attribution", async () => {
    const handler = createFetchHandler();
    const query = "?fbclid=CLICK123&source_channel=facebook&acquisition_channel=paid&platform=meta";
    const entry = await handler(new Request("http://localhost/" + query));
    expect(await entry.text()).toContain("/producto?fbclid=CLICK123&amp;source_channel=facebook");
    for (const product of ["auto", "hogar"]) {
      const selected = await handler(new Request("http://localhost/producto" + query, {
        method: "POST", body: new URLSearchParams({ product }),
      }));
      expect(selected.status).toBe(303);
      expect(selected.headers.get("Location")).toBe("/" + product + query);
      expect(selected.headers.get("Set-Cookie")).toContain(cookie(product, started));
      expect(selected.headers.get("Set-Cookie")).not.toContain(getCheckpointCookieName(product === "auto" ? "hogar" : "auto"));
      const next = await handler(new Request("http://localhost/" + product + query, {
        headers: { Cookie: cookie(product, started) },
      }));
      expect(next.headers.get("Location")).toBe(
        (product === "auto" ? "/auto/estado-donde-vive" : "/hogar/estado-de-la-propiedad") + query,
      );
      expect(next.headers.get("Set-Cookie")).toContain(".CLICK123");
    }
    const invalid = await handler(new Request("http://localhost/producto", {
      method: "POST", body: new URLSearchParams({ product: "invalid" }),
    }));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("Set-Cookie")).toBeNull();
  });

  it("preserves saved generic progress when the visitor selects that product again", async () => {
    const handler = createFetchHandler();
    const saved = { ...started, residence_state: "TX", has_license: "yes" };
    const selected = await handler(new Request("http://localhost/producto", {
      method: "POST", body: new URLSearchParams({ product: "auto" }),
      headers: { Cookie: cookie("auto", saved) + "; " + cookie("hogar", homeAnswers) },
    }));
    expect(selected.status).toBe(303);
    expect(selected.headers.get("Location")).toBe("/auto");
    expect(selected.headers.get("Set-Cookie")).toContain(cookie("auto", saved));
    expect(selected.headers.get("Set-Cookie")).not.toContain(getCheckpointCookieName("hogar"));
    const resumed = await handler(new Request("http://localhost/auto", {
      headers: { Cookie: cookie("auto", saved) },
    }));
    expect(resumed.headers.get("Location")).toBe("/auto/tiene-seguro");
  });

  it("resumes generic progress independently and keeps dedicated state routes", async () => {
    const handler = createFetchHandler();
    for (const [path, location] of [
      ["/auto", "/auto/inicio"], ["/hogar", "/hogar/inicio"],
      ["/auto/tn", "/auto/tn/inicio"], ["/hogar/tx", "/hogar/tx/inicio"],
    ] as const) {
      const response = await handler(new Request("http://localhost" + path, {
        headers: { Cookie: cookie("auto_ca", autoAnswers) },
      }));
      expect(response.headers.get("Location")).toBe(location);
    }
    const resumed = await handler(new Request("http://localhost/auto", {
      headers: { Cookie: cookie("auto", { ...started, residence_state: "TX" }) },
    }));
    expect(resumed.headers.get("Location")).toBe("/auto/tiene-licencia");
  });

  it("redirects missing valid state routes with a confirmation hint, but rejects invalid states", async () => {
    const handler = createFetchHandler();
    for (const [path, expected] of [
      ["/auto/fl", "/auto/inicio?fbclid=CLICK123&state=FL"],
      ["/hogar/ca", "/hogar/inicio?fbclid=CLICK123&state=CA"],
    ] as const) {
      const response = await handler(new Request("http://localhost" + path + "?fbclid=CLICK123"));
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(expected);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    for (const path of ["/auto/zz", "/hogar/not-a-state", "/producto/invalid"]) {
      expect((await handler(new Request("http://localhost" + path))).status).toBe(404);
    }
  });

  it("prefills without saving or bypassing state confirmation and prefers saved answers", async () => {
    const handler = createFetchHandler();
    const url = "http://localhost/auto/estado-donde-vive?state=FL";
    const response = await handler(new Request(url, { headers: { Cookie: cookie("auto", started) } }));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie") ?? "").not.toContain(getCheckpointCookieName("auto") + "=");
    expect(config(html)).toMatchObject({
      initialAnswers: started, initialPrefill: { residence_state: "FL" }, prefillQuery: { state: "FL" },
    });
    expect(config(html).initialAnswers.residence_state).toBeUndefined();
    expect(config(html).previousUrl).toBeUndefined();
    expect(html).toContain('value="FL"');
    const guarded = await handler(new Request("http://localhost/auto/tiene-licencia?state=FL", {
      headers: { Cookie: cookie("auto", started) },
    }));
    expect(guarded.headers.get("Location")).toBe("/auto/estado-donde-vive?state=FL");
    const saved = await handler(new Request(url, {
      headers: { Cookie: cookie("auto", { ...started, residence_state: "TX" }) },
    }));
    expect(await saved.text()).toContain('value="TX"');
    const invalid = await handler(new Request(url.replace("FL", "invalid"), {
      headers: { Cookie: cookie("auto", started) },
    }));
    expect(config(await invalid.text()).initialPrefill).toEqual({});
  });

  it("keeps confirmed states inside the generic funnel even where a state-specific flow exists", async () => {
    const handler = createFetchHandler();
    for (const [key, answerKey, nextUrl] of [
      ["auto", "residence_state", "/auto/tiene-licencia"],
      ["hogar", "property_state", "/hogar/dueno-o-renta"],
    ]) {
      const response = await handler(new Request("http://localhost/api/forms/" + key + "/checkpoints", {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie(key!, started) },
        body: JSON.stringify({ questionKey: answerKey, answer: "TX" }),
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, nextUrl, answers: { [answerKey!]: "TX" } });
    }
  });

  it("renders generic consent with the chosen state and no regional confirmation field", async () => {
    const handler = createFetchHandler();
    for (const [key, answers, state] of [
      ["auto", autoAnswers, "Florida"], ["hogar", homeAnswers, "California"],
    ] as const) {
      const response = await handler(new Request("http://localhost/" + key + "/consentimiento", {
        headers: { Cookie: cookie(key, answers) },
      }));
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain(state);
      expect(html).toContain("Ana Lopez");
      expect(html).toContain("Al marcar esta casilla");
      expect(html).not.toContain('class="area-pill"');
      expect(config(html).currentStep.dynamicResolverDependencies).not.toContain("belongs_to_state");
      expect(config(html).currentStep.dynamicResolverDependencies).not.toContain("property_in_state");
    }
  });

  it("requires a confirmed state for delivery and excludes the welcome answer", () => {
    for (const [form, key, stateKey, answers, state] of [
      [genericAutoFlow, "auto", "residence_state", autoAnswers, "FL"],
      [genericHomeFlow, "hogar", "property_state", homeAnswers, "CA"],
    ] as const) {
      const valid = validateSubmission(form, key, { answers: { ...answers, trustedform_consent: "accepted" } });
      expect(valid.ok).toBe(true);
      if (!valid.ok) throw new Error(JSON.stringify(valid.errors));
      expect(valid.payload.delivery.payload).toMatchObject({ area: state, state_code: state, meta_conversion: { enabled: false } });
      expect(valid.payload.answers).not.toHaveProperty("welcome_started");
      expect(valid.payload.delivery.payload).not.toHaveProperty("welcome_started");
      expect(validateSubmission(form, key, {
        answers: { ...answers, [stateKey]: "", trustedform_consent: "accepted" },
      }).ok).toBe(false);
    }
  });

  it("submits a generic lead to its own thank-you route and clears only its checkpoint", async () => {
    let delivered: unknown;
    const handler = createFetchHandler({ delivery: {
      fetch: async (_url, init) => {
        delivered = JSON.parse(String(init?.body));
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      },
    } });
    const response = await handler(new Request("http://localhost/api/forms/auto/native-submissions", {
      method: "POST",
      headers: { Cookie: cookie("auto", autoAnswers) + "; " + cookie("auto_tn", started) },
      body: new URLSearchParams(Object.entries({ ...autoAnswers, trustedform_consent: "accepted" }).map(
        ([key, value]): [string, string] => [key === "trustedform_consent" ? "answers[trustedform_consent][accepted]" : "answers[" + key + "]", value],
      )),
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/auto/gracias");
    expect(delivered).toMatchObject({ area: "FL", state_code: "FL" });
    expect(response.headers.get("Set-Cookie")).toContain(getPostSubmitCookieName("auto") + "=");
    expect(response.headers.get("Set-Cookie")).not.toContain(getCheckpointCookieName("auto_tn") + "=");
  });

  it("hydrates state preselection and saved consent into production shells", async () => {
    for (const [index, answers, prefill] of [
      [1, started, { residence_state: "FL" }],
      [genericAutoFlow.steps.length - 1, autoAnswers, {}],
    ] as const) {
      const options = {
        activeStepIndex: index, routeKey: "auto", routeSegments: ["auto"],
        stepUrlOverrides: getFormRouteStepUrlOverrides(["auto"], genericAutoFlow),
      };
      const shell = await renderFormPage(genericAutoFlow, {
        ...options, answers: {}, formConfigExpression: FORM_CONFIG_PLACEHOLDER_EXPRESSION,
      });
      const html = injectPrebuiltFormRequestState(shell, genericAutoFlow, index, {
        ...options, answers, initialPrefill: prefill, prefillQuery: { state: "FL" },
      });
      expect(html).toContain("Florida");
      expect(config(html).initialAnswers).toMatchObject(answers);
      if (index !== 1) expect(html).toContain("Ana Lopez");
    }
  });

  it("supports optional generic tracking without inheriting state pixels", () => {
    const enabled = esGenericAutoInsuranceTemplate.create({
      ...defaultAutoInsuranceVariables, flowName: "Generic test", metaPixelId: "1234567890",
      postHogProjectApiKey: "phc_test", postHogApiHost: "https://example.test",
    });
    expect(enabled.tracking?.events?.map((event) => event.kind)).toEqual(expect.arrayContaining([
      "stepView", "stepAnswer", "postHogPageView", "postHogPageLeave", "submitSuccess",
    ]));
    expect(enabled.tracking?.events?.find((event) => event.kind === "stepAnswer")?.meta?.pixelId).toBe("1234567890");
    for (const form of [genericAutoFlow, genericHomeFlow]) {
      expect(form.tracking?.events?.some((event) => event.meta) ?? false).toBe(false);
      expect(form.tracking?.googleTagManager).toBeUndefined();
    }
  });
});
