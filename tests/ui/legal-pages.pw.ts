import { expect, test, type Page } from "@playwright/test";
import { decodeCheckpointAnswers, encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";
import { getPostSubmitCookieName } from "../../src/platform/persistence/cookie-names";

const savedAnswers = {
  welcome_started: "started", residence_state: "TX", has_license: "yes", has_insurance: "no",
  is_clean_title: "yes", number_of_registered_cars: "1", first_name: "Ana", last_name: "Lopez", phone_number: "(615) 555-1234",
};

async function assertLegalRow(page: Page) {
  const nav = page.locator("[data-legal-links]");
  await expect(nav).toBeVisible();
  await expect(page.locator("form [data-legal-links]")).toHaveCount(0);
  await expect(nav.locator("a")).toHaveCount(2);
  const bounds = await page.locator("form").evaluate((form) => {
    const browser = globalThis as any;
    const nav = browser.document.querySelector("[data-legal-links]");
    return { formBottom: form.getBoundingClientRect().bottom, navTop: nav.getBoundingClientRect().top,
      navBottom: nav.getBoundingClientRect().bottom, viewport: browser.innerHeight, width: browser.document.documentElement.clientWidth,
      scrollWidth: browser.document.documentElement.scrollWidth };
  });
  expect(bounds.navTop).toBeGreaterThanOrEqual(bounds.formBottom - 1);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
  if (bounds.width <= 560) expect(bounds.navBottom).toBeLessThanOrEqual(bounds.viewport + 1);
}

async function legalReturnLayout(page: Page) {
  return page.locator("[data-legal-return]").evaluate((button) => {
    const browser = globalThis as any;
    const panel = browser.document.querySelector("[data-legal-page]");
    const area = browser.document.querySelector("[data-legal-return-area]");
    const links = browser.document.querySelector("[data-legal-links]");
    const panelRect = panel.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const panelStyle = browser.getComputedStyle(panel);
    const fade = browser.getComputedStyle(area, "::before");
    return {
      viewport: browser.innerHeight,
      panelTop: panelRect.top, panelBottom: panelRect.bottom,
      contentLeft: panelRect.left + parseFloat(panelStyle.borderLeftWidth) + parseFloat(panelStyle.paddingLeft),
      contentRight: panelRect.right - parseFloat(panelStyle.borderRightWidth) - parseFloat(panelStyle.paddingRight),
      areaTop: areaRect.top, areaBottom: areaRect.bottom,
      buttonLeft: buttonRect.left, buttonRight: buttonRect.right, buttonHeight: buttonRect.height,
      linksTop: links.getBoundingClientRect().top,
      footerBottom: links.closest("[data-legal-footer]").getBoundingClientRect().bottom,
      lastParagraphBottom: panel.querySelector("section:last-of-type p:last-child").getBoundingClientRect().bottom,
      position: browser.getComputedStyle(area).position,
      fadeHeight: parseFloat(fade.height), fadePointerEvents: fade.pointerEvents, fadeBackground: fade.backgroundImage,
      buttonIsHitTarget: browser.document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2)?.closest("[data-legal-return]") === button,
    };
  });
}

test.describe("legal pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/*", async (route) => {
      if (new URL(route.request().url()).hostname !== "127.0.0.1") return route.abort();
      if (route.request().url().includes("/tfc.js")) return route.fulfill({
        contentType: "application/javascript",
        body: `var input = document.createElement('input'); input.type = 'hidden'; input.name = 'xxTrustedFormCertUrl'; input.value = 'https://cert.trustedform.com/454a35b802f3e7b63ffabb4efedb7c6ebe67886c'; document.querySelector('form').appendChild(input);`,
      });
      return route.continue();
    });
  });

  for (const path of ["/politica-de-privacidad", "/terminos-y-condiciones"]) {
    test(`long document scrolls, uses contents links and has no tracking: ${path} @cross-browser`, async ({ page }, testInfo) => {
      if (testInfo.project.name.includes("mobile")) await page.setViewportSize({ width: 320, height: 568 });
      const requests: string[] = [];
      page.on("request", (request) => requests.push(request.url()));
      const cookies = await page.context().cookies();
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("section").first()).toContainText("Seguros Aseguranza es una marca propiedad de Liderna Inc y operada por esta.");
      if (path === "/terminos-y-condiciones") {
        await expect(page.locator("h1")).toHaveText("Términos y condiciones");
        await expect(page.locator("[data-legal-sample]")).toHaveCount(0);
        await expect(page.locator('[data-legal-notice="important"]')).toContainText("ARBITRAJE INDIVIDUAL OBLIGATORIO");
        await expect(page.locator("section")).toHaveCount(16);
        await expect(page.locator("#modificaciones-y-contacto")).toContainText("1058 Windy Creek Path");
      } else {
        await expect(page.locator("[data-legal-sample]")).toHaveCount(0);
        await expect(page.locator('[data-legal-notice="important"]')).toHaveText("Borrador para revisión y aprobación. No constituye la política vigente.");
        await expect(page.locator("section")).toHaveCount(15);
        await expect(page.locator("#remision-y-remuneracion")).toContainText("Podemos remitir su solicitud a uno o varios agentes de seguros con licencia");
        await expect(page.locator("#remision-y-remuneracion")).toContainText("No ofrecemos exclusividad al solicitante");
        await expect(page.locator("#actualizaciones-contacto")).toContainText("hello@liderna.com");
      }
      await expect(page.locator("script, form")).toHaveCount(0);
      const bounds = await page.evaluate(() => {
        const browser = globalThis as any;
        return {
          height: browser.document.documentElement.scrollHeight, viewport: browser.innerHeight,
          width: browser.document.documentElement.scrollWidth, viewportWidth: browser.document.documentElement.clientWidth,
        };
      });
      expect(bounds.height).toBeGreaterThan(bounds.viewport * 2);
      expect(bounds.width).toBeLessThanOrEqual(bounds.viewportWidth);
      const returnLink = page.locator("[data-legal-return]");
      await expect(returnLink).toHaveCount(1);
      await expect(returnLink).toBeInViewport({ ratio: 1 });
      await expect(page.locator("[data-legal-page] [data-legal-links]")).toHaveCount(0);
      await expect(returnLink).toHaveCSS("background-color", "rgb(248, 0, 87)");
      await expect(returnLink).toHaveCSS("border-radius", "8px");
      const top = await legalReturnLayout(page);
      expect(top.position).toBe("sticky");
      expect(top.areaBottom).toBeCloseTo(top.viewport, 0);
      expect(top.buttonHeight).toBeGreaterThanOrEqual(bounds.viewportWidth <= 600 ? 56 : 70);
      expect(top.fadeHeight).toBe(32);
      expect(top.fadePointerEvents).toBe("none");
      expect(top.fadeBackground).toContain("linear-gradient");
      await page.screenshot({ path: testInfo.outputPath("legal-document-top.png") });

      await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight / 2)");
      await expect.poll(async () => (await legalReturnLayout(page)).panelTop).toBeLessThan(0);
      await expect(returnLink).toBeInViewport({ ratio: 1 });
      const middle = await legalReturnLayout(page);
      expect(middle.areaBottom).toBeCloseTo(middle.viewport, 0);
      await page.screenshot({ path: testInfo.outputPath("legal-document-middle.png") });

      await page.locator(".legal-contents a").last().click();
      await expect(page).toHaveURL(/#[a-z-]+$/u);
      await expect(page.locator("section").last().locator("h2")).toBeInViewport();
      await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      await expect(page.locator("[data-legal-footer]")).toBeInViewport();
      for (const link of await page.locator("[data-legal-footer] a").all()) {
        await expect(link).toBeInViewport({ ratio: 1 });
      }
      await expect(returnLink).toBeInViewport({ ratio: 1 });
      const end = await legalReturnLayout(page);
      expect(end.lastParagraphBottom).toBeGreaterThan(0);
      expect(end.lastParagraphBottom).toBeLessThanOrEqual(end.areaTop - end.fadeHeight);
      expect(end.linksTop).toBeGreaterThanOrEqual(end.panelBottom);
      // Document scroll heights round to whole pixels; footer padding can end fractionally below them.
      expect(end.footerBottom).toBeLessThanOrEqual(end.viewport + 1);
      expect(end.areaBottom).toBeLessThan(end.viewport);
      for (const layout of [top, middle, end]) {
        expect(layout.buttonLeft).toBeCloseTo(layout.contentLeft, 0);
        expect(layout.buttonRight).toBeCloseTo(layout.contentRight, 0);
        expect(layout.areaBottom).toBeLessThanOrEqual(layout.panelBottom);
        expect(layout.areaTop).toBeGreaterThanOrEqual(layout.panelTop);
        expect(layout.buttonIsHitTarget).toBe(true);
      }
      await expect(page.locator("[data-legal-links] a").first()).toHaveCSS("color", bounds.viewportWidth <= 600 ? "rgb(77, 88, 120)" : "rgb(255, 253, 244)");
      await page.screenshot({ path: testInfo.outputPath("legal-document-end.png") });
      expect(await page.context().cookies()).toEqual(cookies);
      expect(requests.filter((url) => /tracking-events|checkpoints|partytown|gtm|tfc\.js|facebook|posthog/u.test(url))).toEqual([]);
      await returnLink.click();
      await expect(page).toHaveURL(/\/$/u);
    });
  }

  test("entry links use the same tab and preserve supported ad parameters @cross-browser", async ({ page, context }) => {
    const query = "?fbclid=AD_LEGAL&source_channel=facebook&acquisition_channel=paid&platform=meta&state=TX";
    await page.goto("/" + query);
    await assertLegalRow(page);
    await expect(page.getByRole("button", { name: "Atrás" })).toHaveCount(0);
    await page.getByRole("link", { name: "Política de privacidad", exact: true }).click();
    await expect(page.locator("[data-legal-page]")).toBeVisible();
    expect(context.pages()).toHaveLength(1);
    await page.getByRole("link", { name: "Términos y condiciones", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("Términos y condiciones");
    await page.locator("[data-legal-return]").first().click();
    await expect(page).toHaveURL(new RegExp("/\\?fbclid=AD_LEGAL"));
    await page.getByRole("link", { name: "Empezar mi cotización" }).click();
    await expect(page).toHaveURL(/\/producto\?/u);
    await assertLegalRow(page);
    await page.getByRole("link", { name: "Política de privacidad", exact: true }).click();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/producto" + query);
    await page.locator("[data-legal-return]").first().click();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();
  });

  test("preview documents support keyboard navigation and browser history @cross-browser", async ({ page, browserName }) => {
    await page.goto("/__preview/politica-de-privacidad?returnTo=%2F__preview%2Fproducto");
    // WebKit's macOS default uses Option-Tab to include links in keyboard traversal.
    const tabKey = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await page.keyboard.press(tabKey);
    await expect(page.locator(".legal-contents a").first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("section").first().locator("h2")).toBeInViewport();
    await page.locator('[data-legal-document="/terminos-y-condiciones"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("h1")).toHaveText("Términos y condiciones");
    await page.goBack();
    await expect(page.locator("h1")).toHaveText("Política de privacidad");
    const returnLink = page.locator("[data-legal-return]");
    await returnLink.focus();
    await expect(returnLink).toBeFocused();
    await expect(returnLink).toBeInViewport({ ratio: 1 });
    await expect(returnLink).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/__preview\/producto$/u);
  });

  test("return destination follows SPA changes and saved state survives legal navigation @cross-browser", async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "_fbc", value: "fb.1.1.LEGAL", url: baseURL! }, { name: "liderna_source_channel", value: "facebook", url: baseURL! }]);
    await page.goto("/auto/tn/inicio");
    await page.waitForFunction("Boolean(window.__INSTANT_FORM_RUNTIME__)");
    if (process.env.NODE_ENV === "production") {
      await page.waitForFunction("window.__FORM_CONFIG__.steps.length > 1");
      await page.evaluate("window.__legalDocumentMarker = true");
    }
    await page.getByRole("button", { name: "Empezar mi cotización" }).click();
    await expect(page).toHaveURL(/\/auto\/tn\/vive-en-tennessee$/u);
    await page.locator('[data-step][aria-hidden="false"] [data-option]').first().click();
    await expect(page).toHaveURL(/\/auto\/tn\/tiene-licencia$/u);
    if (process.env.NODE_ENV === "production") expect(await page.evaluate("window.__legalDocumentMarker")).toBe(true);
    await assertLegalRow(page);
    const relevantCookies = async () => Object.fromEntries((await page.context().cookies()).filter((cookie) => [getCheckpointCookieName("auto_tn"), "_fbc", "liderna_source_channel"].includes(cookie.name)).map((cookie) => [cookie.name, cookie.value]));
    // An optimistic transition can precede the checkpoint response; only saved answers are guaranteed.
    await expect.poll(async () => decodeCheckpointAnswers((await relevantCookies())[getCheckpointCookieName("auto_tn")])).toMatchObject({ belongs_to_state: "yes" });
    const before = await relevantCookies();
    await page.getByRole("link", { name: "Política de privacidad", exact: true }).click();
    await expect(page.locator("[data-legal-page]")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/auto/tn/tiene-licencia");
    expect(await relevantCookies()).toEqual(before);
    await page.locator("[data-legal-return]").first().click();
    await expect(page).toHaveURL(/\/auto\/tn\/tiene-licencia$/u);
    await page.getByRole("button", { name: "Atrás", exact: true }).click();
    await expect(page).toHaveURL(/\/auto\/tn\/vive-en-tennessee$/u);
    await expect(page.locator('[data-step][aria-hidden="false"] input[value="yes"]')).toBeChecked();
  });

  test("footer fits on short mobile screens, contact, consent and confirmation @cross-browser", async ({ page, baseURL }, testInfo) => {
    if (testInfo.project.name.includes("mobile")) await page.setViewportSize({ width: 320, height: 568 });
    await page.context().addCookies([{ name: getCheckpointCookieName("auto"), value: encodeCheckpointAnswers(savedAnswers), url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    for (const path of ["/auto/estado-donde-vive", "/auto/telefono", "/auto/consentimiento", "/hogar/inicio"]) {
      await page.goto(path);
      await assertLegalRow(page);
      const buttons = page.locator("form footer");
      await expect(buttons).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(path.replaceAll("/", "-") + ".png") });
      if (path.endsWith("/consentimiento")) {
        await page.getByRole("button", { name: "Continuar", exact: true }).click();
        await expect(page.locator('[data-step][aria-hidden="false"] input[type="checkbox"]')).toBeVisible();
        await assertLegalRow(page);
        await expect(buttons).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath("consent-checkbox.png") });
      }
    }
    await page.context().addCookies([{ name: getPostSubmitCookieName("auto"), value: Buffer.from(JSON.stringify({ trackingEvents: [], stepCountLabel: "Listo" })).toString("base64url"), url: baseURL!, httpOnly: true }]);
    await page.goto("/auto/gracias");
    await assertLegalRow(page);
    await expect(page.locator("form button")).toHaveCount(0);
  });

  test("legal links and saved-answer return work without JavaScript @cross-browser", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    try {
      await context.addCookies([{ name: getCheckpointCookieName("auto"), value: encodeCheckpointAnswers(savedAnswers), url: baseURL!, httpOnly: true }]);
      const page = await context.newPage();
      await page.goto("/auto/telefono?state=TX");
      await page.getByRole("link", { name: "Política de privacidad", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/auto/telefono?state=TX");
      await expect(page.locator("[data-legal-return]")).toHaveCount(1);
      await expect(page.locator("[data-legal-return]")).toBeInViewport({ ratio: 1 });
      await page.locator("[data-legal-return]").first().click();
      await expect(page.locator('input[name="phone_number"]')).toHaveValue(savedAnswers.phone_number);
      await page.goto("/producto?fbclid=NO_JS");
      await page.getByRole("link", { name: "Términos y condiciones", exact: true }).click();
      await expect(page.locator("[data-legal-return]").first()).toHaveAttribute("href", "/producto?fbclid=NO_JS");
    } finally {
      await context.close();
    }
  });
});
