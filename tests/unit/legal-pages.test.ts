import { describe, expect, it } from "bun:test";
import { gunzipSync } from "node:zlib";
import { createFetchHandler } from "../../src/platform/app/server";
import { genericAutoFlow } from "../../src/authoring/flows/generic";
import { legalLinks } from "../../src/authoring/legal/links";
import { privacyPolicy } from "../../src/authoring/legal/privacy-policy";
import { termsAndConditions } from "../../src/authoring/legal/terms-and-conditions";
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

describe("standalone legal pages", () => {
  for (const [path, document] of [["/politica-de-privacidad", privacyPolicy], ["/terminos-y-condiciones", termsAndConditions]] as const) {
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
        if (document.notice) expect(html).toContain(document.notice.text);
        if (document.notice?.title) expect(html).toContain(document.notice.title);
        expect(await attributes(html, "[data-legal-notice-title]", "data-legal-notice-title")).toHaveLength(document.notice?.title ? 1 : 0);
        expect(await attributes(html, "[data-legal-notice]", "data-legal-notice")).toEqual(document.notice ? [document.notice.kind] : []);
        expect(html.includes("data-legal-sample")).toBe(document.notice?.kind === "sample");
        expect(html).not.toMatch(/<script|<form|__FORM_CONFIG__|partytown|tracking-events|gtm\.js|tfc\.js/iu);
        expect(await attributes(html, "[data-legal-return]", "href")).toEqual(["/"]);
        expect(await attributes(html, "[data-legal-logo-return]", "href")).toEqual(["/"]);
        expect(await attributes(html, "[data-legal-logo-return]", "aria-label")).toEqual([document.brandName + ": " + document.returnLabel]);
        expect(await attributes(html, "[data-legal-logo-return]", "target")).toEqual([]);
        expect(await attributes(html, "[data-legal-logo-return] img", "alt")).toEqual([document.brandName]);
        expect(await attributes(html, "[data-legal-logo-return] img", "src")).toEqual(["/assets/logo.webp"]);
        expect(await attributes(html, "[data-legal-page] [data-legal-return-area] a", "href")).toEqual(["/"]);
        expect(await attributes(html, "[data-legal-page] [data-legal-links] a", "href")).toEqual([]);
        expect(await attributes(html, "body > [data-legal-footer] [data-legal-links] a", "href")).toHaveLength(2);
        expect(await attributes(html, "section", "id")).toEqual(document.sections.map((section) => section.id));
        expect(await attributes(html, ".legal-contents a", "href")).toEqual(document.sections.map((section) => "#" + section.id));
        const wordCount = (document.introduction + " " + document.sections.map((section) => section.body).join(" ")).split(/\s+/u).length;
        expect(wordCount).toBeGreaterThanOrEqual(1200);

        for (const method of ["GET", "HEAD"]) {
          const redirect = await handler(new Request(`https://example.test${prefix}${path}/?returnTo=%2Fproducto`, { method }));
          expect(redirect.status).toBe(302);
          expect(redirect.headers.get("Location")).toBe(`${prefix}${path}?returnTo=%2Fproducto`);
          expect(redirect.headers.get("Cache-Control")).toBe("no-store");
        }
      });
    }
  }

  it("renders the calmer terms notice while preserving its section references and contact details", async () => {
    const response = await createFetchHandler()(new Request("https://example.test/terminos-y-condiciones"));
    const html = await response.text();
    expect(termsAndConditions.sections).toHaveLength(16);
    expect(new Set(termsAndConditions.sections.map((section) => section.id)).size).toBe(16);
    expect(termsAndConditions.title).toBe("Términos y condiciones");
    expect(html).toContain("<h1>Términos y condiciones</h1>");
    expect(termsAndConditions.notice?.kind).toBe("important");
    expect(termsAndConditions.notice?.title).toBe("Arbitraje y limitaciones de responsabilidad");
    expect(termsAndConditions.notice?.text).toBe("Estos términos incluyen arbitraje individual obligatorio, renuncia a procedimientos colectivos y limitaciones de responsabilidad, sujetos a las excepciones indicadas. Consulte especialmente las secciones 10, 13 y 14.");
    expect(html).not.toContain("AVISO IMPORTANTE:");
    expect(html).toContain(termsAndConditions.notice!.text);
    expect(html).toContain("Última actualización: 29 de octubre de 2026");
    expect(html).toContain("Seguros Aseguranza es una marca propiedad de Liderna Inc y operada por esta. Liderna Inc es una sociedad constituida en Delaware, Estados Unidos (“Liderna”, “nosotros”).");
    expect(html).toContain("Al aceptar estos términos, usted celebra un acuerdo con Liderna");
    expect(html).toContain("no autoriza a los Proveedores a revenderla");
    expect(html).toContain("US$200");
    expect(html).toContain("1058 Windy Creek Path, Conroe, Texas 77304");
    expect(html).not.toContain("Documento de muestra");
    expect(html).not.toContain("[fecha de publicación]");
    expect(await attributes(html, "#arbitraje a", "href")).toEqual(["https://www.adr.org/industries/consumer/"]);
    // Keep the numbered sections aligned with the prominent notice's cross-references.
    expect(termsAndConditions.sections[9]?.id).toBe("limitacion-de-responsabilidad");
    expect(termsAndConditions.sections[12]?.id).toBe("arbitraje");
    expect(termsAndConditions.sections[13]?.id).toBe("renuncia-colectiva");
  });

  it("renders the finalized privacy policy with its authored date and current allocation facts", async () => {
    const response = await createFetchHandler()(new Request("https://example.test/politica-de-privacidad"));
    const html = await response.text();
    expect(privacyPolicy.sections).toHaveLength(15);
    expect(new Set(privacyPolicy.sections.map((section) => section.id)).size).toBe(15);
    expect(privacyPolicy.notice).toBeUndefined();
    expect(privacyPolicy.introduction).toBe("**Fecha de entrada en vigor: 29 de octubre de 2026.**");
    expect(html).toContain("<strong>Fecha de entrada en vigor: 29 de octubre de 2026.</strong>");
    expect(await attributes(html, "[data-legal-notice], .legal-notice", "class")).toEqual([]);
    expect(html).not.toMatch(/borrador|pendientes de aprobación|No constituye la política vigente/iu);
    expect(html).not.toContain("Documento de muestra");
    expect(html).not.toContain("Última actualización:");
    expect(html).toContain("Seguros Aseguranza es una marca propiedad de Liderna Inc y operada por esta. Liderna Inc es una sociedad constituida en Delaware, Estados Unidos (“Liderna”, “nosotros”).");
    expect(html).toContain("hello@liderna.com");
    expect(html).toContain("1058 Windy Creek Path, Conroe, Texas 77304");
    expect(html).toContain("La selección de los Agentes destinatarios puede considerar las características de su solicitud, el tipo de seguro, la ubicación, los criterios de elegibilidad establecidos por los Agentes, su disponibilidad y factores operativos y comerciales.");
    expect(html).toContain("La asignación se gestiona internamente; los Agentes reciben información de la solicitud únicamente después de ser seleccionados como destinatarios.");
    expect(html).toContain("Podemos remitir su solicitud a uno o varios agentes de seguros con licencia");
    expect(html).toContain("No ofrecemos exclusividad al solicitante ni garantizamos un número determinado de destinatarios o contactos");
    expect(html).not.toContain("presupuestos de participación de los Agentes");
    expect(html).not.toContain("probabilidad de recibir una solicitud");
    expect(html).toContain("Liderna no establece las primas ni las condiciones de cobertura. Las cotizaciones y los productos de seguro están sujetos a la evaluación y las condiciones de los Agentes y las aseguradoras correspondientes. No garantizamos precios, ahorros, coberturas o resultados específicos, ni la obtención de una cotización o póliza.");
    expect(html).not.toContain("La asignación no garantiza que el destinatario ofrezca");
    expect(html).not.toContain("Actualmente, cada solicitud se entrega exclusivamente al Agente seleccionado");
    expect(html).not.toContain("La modalidad actual no constituye una garantía de exclusividad para futuras versiones del Servicio");
    expect(html).not.toContain("Si habilitamos la remisión de una solicitud a varios Agentes");
    expect(html).toContain("no autoriza a los Agentes a revenderla");
    expect(html).toContain("PostHog para analizar el uso y rendimiento del Servicio y gestionar registros operativos");
    expect(html).toContain("También trabajamos con Meta");
    expect(html).toContain("Meta puede recibir información sobre su actividad en el Servicio y utilizarla con fines publicitarios");
    expect(html).toContain("no procesa automáticamente las señales &quot;Do Not Track&quot; (DNT) ni &quot;Global Privacy Control&quot; (GPC)");
    expect(html).toContain("Los derechos, las solicitudes y las obligaciones relativas a estas señales dependen de la normativa aplicable");
    expect(html).not.toContain("SmartFinancial");
    expect(await attributes(html, "#evidencia-de-consentimiento a", "href")).toEqual(["https://activeprospect.com/trustedform-privacy-notice/"]);
  });

  for (const prefix of ["", "/__preview"]) {
    it(`renders the clarified privacy disclosures on ${prefix}/politica-de-privacidad`, async () => {
      const response = await createFetchHandler()(new Request(`https://example.test${prefix}/politica-de-privacidad`));
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain("Las comunicaciones comerciales se realizan conforme a las autorizaciones aplicables y la legislación correspondiente.");
      expect(html).toContain("La recopilación puede comenzar antes del envío final.");
      expect(html).toContain("La conservación de la información ya recibida se rige por esta Política, aunque la solicitud no llegue a completarse. Las solicitudes de eliminación se atienden conforme a la legislación aplicable.");
      expect(html).not.toContain("Abandonar el formulario, cerrar el navegador o borrar cookies");
      expect(html).toContain("seleccionar destinatarios según el producto, la ubicación, la disponibilidad, los criterios de elegibilidad establecidos por los Agentes y los criterios comerciales de asignación");
      expect(html).toContain("Los Agentes pueden verificar o complementar la información mediante otras fuentes por su propia cuenta.");
      expect(html).toContain("Los destinatarios pueden actuar como proveedores que procesan información por nuestra cuenta o como responsables independientes, según la actividad y los acuerdos aplicables.");
      const independentProcessing = "Los tratamientos realizados de forma independiente por los Agentes u otros terceros se rigen por sus propias políticas y obligaciones. En la máxima medida permitida por la ley, Liderna no responde por actos u omisiones exclusivamente atribuibles a dichos terceros. Esta disposición no excluye responsabilidades que la ley imponga directamente a Liderna.";
      expect(html.split(independentProcessing)).toHaveLength(2);
      expect(html).not.toContain("Cuando realizan estas actividades de manera independiente");
      expect(html).not.toContain("Esta Política no sustituye sus propios avisos cuando actúen de manera independiente");
      expect(html).toContain("Utilizamos PostHog para analizar el uso y rendimiento del Servicio y gestionar registros operativos. Según su finalidad, estos registros pueden incluir datos técnicos, información de solicitudes y datos de contacto.");
      expect(html).toContain("Publicaremos las versiones actualizadas en esta página, indicando su fecha de entrada en vigor. Proporcionaremos avisos adicionales y recabaremos las autorizaciones que resulten legalmente exigibles.");
      expect(html).toContain("Una actualización no constituye por sí sola autorización retroactiva para tratamientos que requieran consentimiento.");
    });

    it(`renders safe external privacy links on ${prefix}/politica-de-privacidad`, async () => {
      const response = await createFetchHandler()(new Request(`https://example.test${prefix}/politica-de-privacidad`));
      const html = await response.text();
      const links = [
        ["política de privacidad de PostHog", "https://posthog.com/privacy"],
        ["política de privacidad de Meta", "https://www.facebook.com/privacy/policy/"],
      ] as const;

      expect(response.status).toBe(200);
      expect(await attributes(html, "#cookies a", "href")).toEqual(links.map(([, href]) => href));
      expect(await attributes(html, "#cookies a", "target")).toEqual(["_blank", "_blank"]);
      expect(await attributes(html, "#cookies a", "rel")).toEqual(["nofollow noopener noreferrer", "nofollow noopener noreferrer"]);
      for (const [label, href] of links) {
        expect(html).toContain(`<a href="${href}" rel="nofollow noopener noreferrer" target="_blank">${label}</a>`);
      }
    });
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
      for (const path of ["/politica-de-privacidad", "/terminos-y-condiciones"]) {
        for (const prefix of ["", "/__preview"]) {
          const response = await handler(new Request(`https://example.test${prefix}${path}?` + new URLSearchParams({ returnTo: input! })));
          const html = await response.text();
          expect(await attributes(html, "[data-legal-return]", "href")).toEqual([expected!]);
          expect(await attributes(html, "[data-legal-logo-return]", "href")).toEqual([expected!]);
          const crossLinks = await attributes(html, "[data-legal-document]", "href");
          for (const link of crossLinks) expect(new URL(link, "https://example.test").searchParams.get("returnTo")).toBe(expected!);
        }
      }
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
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toContain("Fecha de entrada en vigor: 29 de octubre de 2026.");
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
    const legal = await renderLegalPage({ ...termsAndConditions, notice: { kind: "important", title: '<b>Notice</b>', text: '<img src=x onerror=alert(1)>' }, sections: [{ id: "test", title: '<img src=x>', body: '<script>alert(1)</script>\n\n- **Example**' }] }, "/");
    expect(legal).toContain("&lt;script&gt;");
    expect(legal).not.toContain("<script>");
    expect(legal).toContain("<strong>Example</strong>");
    expect(legal).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(legal).toContain("&lt;b&gt;Notice&lt;/b&gt;");
    expect(legal).not.toContain("<b>Notice</b>");
    expect(getLegalReturnPath("/auto?phone=secret&state=TX")).toBe("/auto?state=TX");
  });

  it("preserves notices authored without a title", async () => {
    const html = await renderLegalPage({ ...termsAndConditions, notice: { kind: "sample", text: "Sample notice" } }, "/");
    expect(html).toContain("Sample notice");
    expect(await attributes(html, "[data-legal-notice]", "data-legal-notice")).toEqual(["sample"]);
    expect(await attributes(html, "[data-legal-sample]", "data-legal-sample")).toHaveLength(1);
    expect(await attributes(html, "[data-legal-notice-title]", "data-legal-notice-title")).toEqual([]);
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
