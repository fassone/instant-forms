import { describe, expect, it } from "bun:test";
import { gunzipSync } from "node:zlib";
import { createFetchHandler } from "../../src/platform/app/server";
import { genericAutoFlow } from "../../src/authoring/flows/generic";
import { legalLinks } from "../../src/authoring/legal/links";
import { samplePrivacyPolicy, sampleTerms } from "../../src/authoring/legal/sample-documents";
import { formRoutes } from "../../src/authoring/routes/registry";
import { defineFormFlow, step, z, type FormLegalLink } from "../../src/platform/flow";
import { getFormRouteBuildEntries } from "../../src/platform/routing";
import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";
import { getPostSubmitCookieName } from "../../src/platform/persistence/cookie-names";
import { renderFormPage, FORM_CONFIG_PLACEHOLDER_EXPRESSION } from "../../src/platform/rendering";
import { injectPrebuiltFormRequestState } from "../../src/platform/rendering/prebuilt-pages";
import { prepareInlineAssetHtml } from "../../src/platform/rendering/inline-assets";
import { renderLegalPage } from "../../src/platform/rendering/legal-page";
import { getLegalReturnPath } from "../../src/platform/rendering/legal-links";

async function attributes(html: string, selector: string, attribute: string) {
  const values: string[] = [];
  await new HTMLRewriter().on(selector, { element(element) {
    const value = element.getAttribute(attribute);
    if (value !== null) values.push(value.replace(/&amp;/gu, "&"));
  } }).transform(new Response(html)).text();
  return values;
}

function checkpoint(routeKey: string, answers: Record<string, string>) {
  return `${getCheckpointCookieName(routeKey)}=${encodeCheckpointAnswers(answers)}`;
}

describe("standalone sample legal pages", () => {
  for (const [path, document] of [["/politica-de-privacidad", samplePrivacyPolicy], ["/terminos-y-condiciones", sampleTerms]] as const) {
    for (const prefix of ["", "/__preview"]) {
      it(`serves ${prefix}${path} without a form runtime, tracking or cookie changes`, async () => {
        const logs: unknown[] = [];
        const handler = createFetchHandler({ eventLogger: (event) => logs.push(event) });
        const response = await handler(new Request(`https://example.test${prefix}${path}?fbclid=IGNORED`, {
          headers: { Cookie: checkpoint("auto", { welcome_started: "started", residence_state: "TX" }) + "; _fbc=fb.1.1.KEEP" },
        }));
        const html = await response.text();
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
        expect(response.headers.get("Set-Cookie")).toBeNull();
        expect(logs).toEqual([]);
        expect(html).toContain(document.title);
        expect(html).toContain(document.sampleNotice);
        expect(html).not.toMatch(/<script|<form|__FORM_CONFIG__|partytown|tracking-events|gtm\.js|tfc\.js/iu);
        expect(await attributes(html, "[data-legal-return]", "href")).toEqual(["/", "/"]);
        expect(await attributes(html, "section", "id")).toEqual(document.sections.map((section) => section.id));
        expect(await attributes(html, ".legal-contents a", "href")).toEqual(document.sections.map((section) => "#" + section.id));
        const wordCount = (document.introduction + " " + document.sections.map((section) => section.body).join(" ")).split(/\s+/u).length;
        expect(wordCount).toBeGreaterThanOrEqual(1200);
        expect(wordCount).toBeLessThanOrEqual(1800);

        for (const method of ["GET", "HEAD"]) {
          const redirect = await handler(new Request(`https://example.test${prefix}${path}/?returnTo=%2Fproducto`, { method }));
          expect(redirect.status).toBe(302);
          expect(redirect.headers.get("Location")).toBe(`${prefix}${path}?returnTo=%2Fproducto`);
          expect(redirect.headers.get("Cache-Control")).toBe("no-store");
        }
      });
    }
  }

  it("only returns to recognized local quote routes and approved query parameters", async () => {
    const handler = createFetchHandler();
    for (const [input, expected] of [
      ["/", "/"], ["/producto/", "/producto"],
      ["/auto/estado-donde-vive", "/auto/estado-donde-vive"],
      ["/hogar/tx/consentimiento", "/hogar/tx/consentimiento"],
      ["/__preview/auto/tn/tiene-licencia", "/__preview/auto/tn/tiene-licencia"],
      ["/__preview/producto", "/__preview/producto"],
      ["https://example.test/auto/inicio", "/auto/inicio"],
      ["/?fbclid=AD&source_channel=fb&acquisition_channel=paid&platform=meta&state=TX&phone=secret#field", "/?fbclid=AD&source_channel=fb&acquisition_channel=paid&platform=meta&state=TX"],
      ["https://evil.test/auto/inicio", "/"], ["//evil.test", "/"],
      ["/\\evil.test", "/"], ["javascript:alert(1)", "/"],
      ["/api/forms/auto/checkpoints", "/"], ["/auto/not-a-step", "/"],
      ["/politica-de-privacidad", "/"], ["/__preview/terminos-y-condiciones", "/"],
      ["/assets/logo.webp", "/"], ["/%2F%2Fevil.test", "/"],
    ]) {
      const response = await handler(new Request("https://example.test/politica-de-privacidad?" + new URLSearchParams({ returnTo: input! })));
      const html = await response.text();
      expect(await attributes(html, "[data-legal-return]", "href")).toEqual([expected!, expected!]);
      const crossLink = (await attributes(html, '[data-legal-document="/terminos-y-condiciones"]', "href"))[0]!;
      expect(new URL(crossLink, "https://example.test").searchParams.get("returnTo")).toBe(expected!);
    }
  });

  it("uses existing origin compression without changing the legal page cache policy", async () => {
    const response = await createFetchHandler()(new Request("https://example.test/politica-de-privacidad", {
      headers: { "Accept-Encoding": "gzip" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("Vary")).toContain("Accept-Encoding");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toContain(samplePrivacyPolicy.sampleNotice);
  });

  it("keeps legal links outside every authored form and does not add steps", async () => {
    const entries = getFormRouteBuildEntries(formRoutes);
    expect(entries).toHaveLength(12);
    const handler = createFetchHandler();
    for (const path of ["/", "/producto", "/auto/inicio", "/hogar/inicio", "/auto/tn/inicio", "/hogar/tx/inicio", "/__preview/auto/tn/consentimiento"]) {
      const response = await handler(new Request("https://example.test" + path + "?state=TX&email=secret"));
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(await attributes(html, "form [data-legal-links] a", "href")).toEqual([]);
      const links = await attributes(html, "[data-legal-links] a", "href");
      expect(links).toHaveLength(2);
      expect(new URL(links[0]!, "https://example.test").searchParams.get("returnTo")).toBe(path + "?state=TX");
      expect(await attributes(html, "[data-legal-links] a", "target")).toEqual([]);
    }
    for (const { form } of entries) expect(form.page.legalLinks).toEqual(legalLinks);
  });

  it("leaves saved answers and attribution unchanged through a legal visit and return", async () => {
    const handler = createFetchHandler();
    const cookies = checkpoint("auto", { welcome_started: "started", residence_state: "TX", has_license: "yes" }) + "; _fbc=fb.1.1.AD; liderna_source_channel=facebook; liderna_acquisition_channel=paid";
    const response = await handler(new Request("https://example.test/politica-de-privacidad?returnTo=%2Fauto%2Ftiene-licencia", { headers: { Cookie: cookies } }));
    expect(response.headers.getSetCookie()).toEqual([]);
    const href = (await attributes(await response.text(), "[data-legal-return]", "href"))[0]!;
    const resumed = await handler(new Request("https://example.test" + href, { headers: { Cookie: cookies } }));
    expect(resumed.status).toBe(200);
    expect(await resumed.text()).toMatch(/value="yes"[^>]*checked/u);
    expect(resumed.headers.getSetCookie()).not.toContainEqual(expect.stringContaining("Max-Age=0"));
  });

  it("includes links on confirmation without adding form controls or changing one-time access", async () => {
    const handler = createFetchHandler();
    const state = Buffer.from(JSON.stringify({ trackingEvents: [], stepCountLabel: "Listo" })).toString("base64url");
    const response = await handler(new Request("https://example.test/auto/gracias", { headers: { Cookie: `${getPostSubmitCookieName("auto")}=${state}` } }));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(await attributes(html, "[data-legal-links] a", "href")).toHaveLength(2);
    expect(html).not.toContain('id="back-button"');
    expect(html).not.toContain('id="next-button"');
    const returnVisit = await handler(new Request("https://example.test/auto/gracias"));
    expect(returnVisit.status).toBe(302);
    expect(returnVisit.headers.get("Location")).toBe("/auto");
  });

  it("injects request-specific legal return links into production shells and escapes documents", async () => {
    const source = await renderFormPage(genericAutoFlow, { activeStepIndex: 1, formConfigExpression: FORM_CONFIG_PLACEHOLDER_EXPRESSION });
    const html = injectPrebuiltFormRequestState(await prepareInlineAssetHtml(source, "built"), genericAutoFlow, 1, {
      routeSegments: ["auto"], legalReturnTo: "/auto/estado-donde-vive?state=TX&phone=secret", answers: { welcome_started: "started" },
    });
    const links = await attributes(html, "[data-legal-links] a", "href");
    expect(links).toHaveLength(2);
    expect(new URL(links[0]!, "https://example.test").searchParams.get("returnTo")).toBe("/auto/estado-donde-vive?state=TX");
    expect(html).toContain("data-legal-document");
    const legal = await renderLegalPage({ ...sampleTerms, sections: [{ id: "test", title: '<img src=x>', body: '<script>alert(1)</script>\n\n- **Example**' }] }, "/");
    expect(legal).toContain("&lt;script&gt;");
    expect(legal).not.toContain("<script>");
    expect(legal).toContain("<strong>Example</strong>");
    expect(getLegalReturnPath("/auto?phone=secret&state=TX")).toBe("/auto?state=TX");
  });

  it("validates optional authored links and preserves pages that omit them", async () => {
    const makeFlow = (links?: readonly FormLegalLink[]) => defineFormFlow({
      name: "Legal links", status: "ACTIVE", locale: "es", ui: genericAutoFlow.ui, postSubmit: genericAutoFlow.postSubmit,
      contract: { context: z.object({}), answers: z.object({ answer: z.enum(["yes"]) }), payload: z.object({ answer: z.string() }) },
      context: {}, payload: { url: "https://example.test/leads", method: "POST", encoding: "json", mapping: ({ answers }) => ({ answer: answers.answer }) },
      page: { name: "Example", legalLinks: links },
      steps: [step.choice({ key: "answer", slug: "answer", label: "Answer", options: [{ key: "yes", label: "Yes" }] })],
    });
    expect(() => makeFlow(legalLinks)).not.toThrow();
    for (const link of [{ label: "", href: "/privacy" }, { label: "<b>Policy</b>", href: "/privacy" }, { label: "Policy", href: "//evil.test" }, { label: "Policy", href: "javascript:alert(1)" }]) {
      expect(() => makeFlow([link])).toThrow("page.legalLinks");
    }
    const html = await renderFormPage(makeFlow());
    expect(await attributes(html, "[data-legal-links] a", "href")).toEqual([]);
    expect(html).not.toContain('class="shell legal-shell"');
    expect(html).not.toContain("link.dataset.legalDocument");
  });
});
