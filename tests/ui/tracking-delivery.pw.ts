import { expect, test, type Page } from "@playwright/test";
import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";
import { getTrackingVisitorIdCookieName } from "../../src/platform/persistence/cookie-names";

const savedAnswers = {
  welcome_started: "started", belongs_to_state: "yes", has_license: "yes", has_insurance: "no",
  is_clean_title: "yes", number_of_registered_cars: "1", first_name: "Ana", last_name: "Lopez", phone_number: "+16155551234",
};

async function events(page: Page) {
  const visitor = (await page.context().cookies()).find((cookie) => cookie.name === getTrackingVisitorIdCookieName())?.value;
  return (await (await page.request.get(`/__test/tracking?visitor=${visitor ?? ""}`)).json()) as Array<{ url: string; body: any }>;
}

async function waitForTransition(page: Page) {
  await page.waitForFunction("Boolean(window.__INSTANT_FORM_RUNTIME__)");
  const url = await page.evaluate("window.__FORM_CONFIG__.transitionAssetUrl");
  if (process.env.NODE_ENV === "production") expect(url).toBeTruthy();
  if (url) {
    await page.waitForFunction("window.__FORM_CONFIG__.steps.length > 1");
  }
  return Boolean(url);
}

async function mockTrustedForm(page: Page) {
  await page.route("**/_instant/scripts/**/tfc.js**", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `var input = document.createElement('input'); input.type = 'hidden'; input.name = 'xxTrustedFormCertUrl'; input.value = 'https://cert.trustedform.com/454a35b802f3e7b63ffabb4efedb7c6ebe67886c'; document.querySelector('form').appendChild(input);`,
  }));
}

test.describe("tracking delivery isolation", () => {
  test.beforeEach(async ({ page }) => {
    // Any accidentally loaded external tracker is observed, but never contacts a real service.
    await page.route("**/*", async (route) => {
      if (new URL(route.request().url()).hostname !== "127.0.0.1") return route.abort();
      return route.continue();
    });
  });

  for (const path of ["/auto/tn/inicio", "/hogar/tx/inicio", "/auto/inicio", "/hogar/inicio"]) {
    test(`no GTM, Pixel or Partytown loading at ${path} @cross-browser`, async ({ page }) => {
      const requests: string[] = [];
      page.on("request", (request) => requests.push(request.url()));
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Empezar mi cotización" })).toBeVisible();
      await expect.poll(() => events(page)).not.toEqual([]);
      expect(await page.evaluate("window.__FORM_CONFIG__.tracking.googleTagManager")).toBeUndefined();
      expect(await page.evaluate("typeof window.dataLayer")).toBe("undefined");
      expect(await page.evaluate("typeof window.partytown")).toBe("undefined");
      expect(requests.filter((url) => /googletagmanager|facebook|fbevents|partytown|google-tags|\/_instant\/meta\//u.test(url))).toEqual([]);
      expect((await events(page)).every((call) => call.url === "https://posthog.example.test/i/v0/e/")).toBe(true);
    });
  }

  test("entry and product selection remain untracked and preserve ad parameters @cross-browser", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto("/?fbclid=CLICK_ENTRY&source_channel=facebook&acquisition_channel=paid&platform=meta");
    await page.getByRole("link", { name: "Empezar mi cotización" }).click();
    await expect(page).toHaveURL(/\/producto\?fbclid=CLICK_ENTRY/u);
    expect(await page.evaluate("typeof window.dataLayer")).toBe("undefined");
    expect((await page.context().cookies()).find((cookie) => cookie.name === getTrackingVisitorIdCookieName())).toBeUndefined();
    expect(requests.filter((url) => /tracking-events|gtm\.js|partytown/u.test(url))).toEqual([]);
    await page.getByText("Seguro de auto", { exact: true }).click();
    await expect(page).toHaveURL(/\/auto\/estado-donde-vive(?:\?|$)/u);
    expect(requests.some((url) => url.includes("/auto/estado-donde-vive?fbclid=CLICK_ENTRY"))).toBe(true);
    const cookies = Object.fromEntries((await page.context().cookies()).map((cookie) => [cookie.name, cookie.value]));
    expect(cookies._fbc).toMatch(/^fb\.1\.\d+\.CLICK_ENTRY$/u);
    expect(cookies.liderna_source_channel).toBe("facebook");
    expect(cookies.liderna_acquisition_channel).toBe("paid");
    expect(cookies.liderna_platform).toBe("meta");
  });

  test("pixel-only metadata captures IDs without tracking requests or dataLayer pushes @cross-browser", async ({ page, baseURL }) => {
    await page.addInitScript("window.dataLayer = []; window.__INSTANT_PUSH_INITIAL_TRACKING_EVENTS__ = function() { window.dataLayer.push({ event: 'unexpected_initial_push' }); };");
    await page.context().addCookies([
      { name: "_fbp", value: "fb.1.1.existing-browser", url: baseURL! },
      { name: "_fbc", value: "fb.1.1.EXISTING", url: baseURL! },
    ]);
    const requests: string[] = [];
    const checkpointBodies: any[] = [];
    page.on("request", (request) => {
      requests.push(request.url());
      if (request.url().endsWith("/checkpoints")) checkpointBodies.push(request.postDataJSON());
    });
    await page.goto("/test-meta/inicio?fbclid=EXISTING");
    await page.waitForFunction("Boolean(window.__INSTANT_FORM_RUNTIME__)");
    await page.getByRole("button", { name: "Empezar mi cotización" }).click();
    await expect(page).toHaveURL(/\/test-meta\/vive-en-tennessee/u);
    expect(await page.evaluate("window.dataLayer")).toEqual([]);
    expect(checkpointBodies[0].tracking).toMatchObject({ fbp: "fb.1.1.existing-browser", fbc: "fb.1.1.EXISTING" });
    expect(requests.filter((url) => /tracking-events|gtm\.js|partytown|facebook/u.test(url))).toEqual([]);
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === "_fbp")?.value).toBe("fb.1.1.existing-browser");
    expect(cookies.find((cookie) => cookie.name === "_fbc")?.value).toBe("fb.1.1.EXISTING");
    await page.context().clearCookies({ name: "_fbp" });
    await page.goto("/test-meta/inicio");
    await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === "_fbp")?.value).toMatch(/^fb\.1\./u);
    expect(await page.evaluate("window.dataLayer")).toEqual([]);

    await mockTrustedForm(page);
    await page.context().clearCookies({ name: getCheckpointCookieName("test-meta") });
    await page.context().addCookies([{ name: getCheckpointCookieName("test-meta"), value: encodeCheckpointAnswers(savedAnswers), url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/test-meta/consentimiento");
    await page.waitForFunction("Boolean(window.__INSTANT_FORM_RUNTIME__)");
    await expect(page.getByRole("heading", { name: "Antes de cotizar" })).toBeVisible();
    await page.locator("footer button").last().click();
    await page.getByRole("button", { name: "Cotizar", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    expect(await page.evaluate("window.dataLayer")).toEqual([]);
    expect(requests.filter((url) => /tracking-events|gtm\.js|partytown|facebook/u.test(url))).toEqual([]);
  });

  test("PostHog retains all seven events, transitions and native submit without GTM @cross-browser", async ({ page, baseURL }) => {
    await page.addInitScript("window.dataLayer = [];");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mockTrustedForm(page);
    await page.goto("/auto/tn/inicio");
    const spa = await waitForTransition(page);
    await page.evaluate("window.__trackingDocumentMarker = true");
    await page.getByRole("button", { name: "Empezar mi cotización" }).click();
    await expect(page).toHaveURL(/\/auto\/tn\/vive-en-tennessee$/u);
    if (spa) expect(await page.evaluate("window.__trackingDocumentMarker")).toBe(true);
    await expect.poll(async () => (await events(page)).filter((call) => call.body.event === "$pageview" && call.body.properties.step_key === "belongs_to_state").length).toBe(1);
    await page.locator('[data-step][aria-hidden="false"] [data-option]').first().click();
    await expect(page).toHaveURL(/\/auto\/tn\/tiene-licencia$/u);
    await page.goBack();
    await expect(page).toHaveURL(/\/auto\/tn\/vive-en-tennessee$/u);
    await expect.poll(async () => (await events(page)).filter((call) => call.body.event === "$pageview" && call.body.properties.step_key === "belongs_to_state").length).toBe(2);
    await page.waitForFunction("Boolean(window.__INSTANT_FORM_RUNTIME__)");
    expect(await page.evaluate("window.dataLayer")).toEqual([]);

    // Hide/pagehide both fire on mobile; only one leave is sent per visible instance.
    const before = (await events(page)).filter((call) => call.body.event === "$pageleave").length;
    await page.evaluate(`
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    `);
    await expect.poll(async () => (await events(page)).filter((call) => call.body.event === "$pageleave").length).toBe(before + 1);

    await page.context().clearCookies({ name: getCheckpointCookieName("auto_tn") });
    await page.context().addCookies([{ name: getCheckpointCookieName("auto_tn"), value: encodeCheckpointAnswers(savedAnswers), url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/auto/tn/consentimiento");
    await waitForTransition(page);
    await expect(page.getByRole("heading", { name: "Antes de cotizar" })).toBeVisible();
    await page.locator("footer button").last().click();
    const checkbox = page.locator('[data-step][aria-hidden="false"] input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await page.getByRole("button", { name: "Cotizar", exact: true }).click();
    await expect(page).toHaveURL(/\/auto\/tn\/gracias$/u);
    await expect.poll(async () => (await events(page)).some((call) => call.body.event === "instant_form_submit_success")).toBe(true);
    const calls = await events(page);
    expect(new Set(calls.map((call) => call.body.event))).toEqual(new Set([
      "instant_form_view", "instant_form_step_view", "instant_form_step_answer",
      "instant_form_trusted_form_substep_view", "instant_form_submit_success", "$pageview", "$pageleave",
    ]));
    expect(new Set(calls.map((call) => call.body.distinct_id)).size).toBe(1);
    expect(new Set(calls.map((call) => call.body.properties.$session_id)).size).toBe(1);
    expect(calls.every((call) => call.url === "https://posthog.example.test/i/v0/e/")).toBe(true);
    expect(calls.filter((call) => call.body.event === "instant_form_trusted_form_substep_view").map((call) => call.body.properties.trusted_form_substep)).toEqual(["review", "consent"]);
    expect(await page.evaluate("window.dataLayer")).toEqual([]);
    expect(errors).toEqual([]);
  });
});
