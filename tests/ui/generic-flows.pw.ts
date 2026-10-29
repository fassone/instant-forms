import { expect, test, type Page } from "@playwright/test";
import { decodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";

test.use({ serviceWorkers: "block" });

function activeStep(page: Page) {
  return page.locator('[aria-hidden="false"][data-step]');
}

test.beforeEach(async ({ page }) => {
  await page.route("**/_instant/scripts/**", (route) => route.fulfill({
    contentType: "application/javascript", body: "",
  }));
  await page.route("**/_instant/**/proxy**", (route) => route.fulfill({ body: "" }));
});

async function waitForController(page: Page) {
  await expect.poll(() => page.evaluate("Boolean(window.__INSTANT_FORM_RUNTIME__)")).toBe(true);
  if (await page.evaluate("Boolean(window.__FORM_CONFIG__.transitionAssetUrl)")) {
    await expect.poll(() => page.evaluate("window.__FORM_CONFIG__.steps.length")).toBeGreaterThan(1);
  }
}

async function waitForStateCheckpoint(page: Page, state: string) {
  await expect.poll(async () => {
    const cookie = (await page.context().cookies()).find((candidate) => candidate.name === getCheckpointCookieName("auto"));
    return decodeCheckpointAnswers(cookie?.value);
  }).toMatchObject({ residence_state: state });
}

async function expectWelcomeLayout(page: Page) {
  await expect(page.locator("footer button, footer a")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toHaveCount(0);
  const title = await page.getByRole("heading", { level: 1 }).boundingBox();
  const body = await page.locator("[data-welcome-content] p").boundingBox();
  const bullets = await page.locator("[data-welcome-content] ul").boundingBox();
  expect(title).not.toBeNull();
  expect(body).not.toBeNull();
  expect(bullets).not.toBeNull();
  expect(body!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
  expect(bullets!.y).toBeGreaterThanOrEqual(body!.y + body!.height);
  expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test("trailing-slash page URLs reach their canonical pages @cross-browser", async ({ page }) => {
  for (const [path, canonicalPath] of [
    ["/auto/", "/auto/inicio"],
    ["/hogar/", "/hogar/inicio"],
    ["/producto/", "/producto"],
    ["/__preview/producto/", "/__preview/producto"],
    ["/auto/tn/inicio/", "/auto/tn/inicio"],
    ["/__preview/hogar/tx/inicio/", "/__preview/hogar/tx/inicio"],
  ]) {
    const response = await page.goto(path + "?source_channel=website&state=FL");
    expect(response?.status()).toBe(200);
    expect(response?.url()).toBe(new URL(canonicalPath + "?source_channel=website&state=FL", page.url()).href);
    await expect(page).toHaveURL((url) => url.pathname === canonicalPath);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("generic shared welcome chooses a product and skips its second welcome @cross-browser", async ({ page }, testInfo) => {
  await page.goto("/?source_channel=website&acquisition_channel=organic");
  await expectWelcomeLayout(page);
  await page.screenshot({ path: testInfo.outputPath("generic-welcome.png"), fullPage: true });
  await page.getByRole("link", { name: "Empezar mi cotización" }).click();
  await expect(page).toHaveURL(/\/producto\?/u);
  await expect(page.getByRole("heading", { name: "¿Qué desea asegurar?" })).toBeVisible();
  await page.getByRole("radio", { name: /Seguro de auto/u }).check();
  await expect(page).toHaveURL(/\/auto\/estado-donde-vive/u);
  await waitForController(page);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeDisabled();
  await expect(activeStep(page).locator("input")).toHaveValue("");
  await activeStep(page).locator("input").fill("Texas");
  await activeStep(page).getByRole("button", { name: /Texas/u }).click();
  await expect(page).toHaveURL(/\/auto\/tiene-licencia$/u);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Atrás", exact: true }).click();
  await expect(page).toHaveURL(/\/auto\/estado-donde-vive$/u);
  await expect(activeStep(page).locator("input")).toHaveValue(/^(TX|Texas)$/u);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeDisabled();
});

test("generic fallback state stays pending until confirmation and survives refresh @cross-browser", async ({ page }, testInfo) => {
  await page.goto("/auto/fl");
  await expect(page).toHaveURL(/\/auto\/inicio\?state=FL$/u);
  await waitForController(page);
  await expectWelcomeLayout(page);
  await page.getByRole("button", { name: "Empezar mi cotización" }).click();
  await expect(page).toHaveURL(/\/auto\/estado-donde-vive\?state=FL$/u);
  await expect(activeStep(page).locator("input")).toHaveValue(/^(FL|Florida)$/u);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeDisabled();
  expect(await page.evaluate("window.__FORM_CONFIG__.initialAnswers.residence_state")).toBeUndefined();
  await page.reload();
  await waitForController(page);
  await expect(activeStep(page).locator("input")).toHaveValue(/^(FL|Florida)$/u);
  await page.screenshot({ path: testInfo.outputPath("generic-state.png"), fullPage: true });
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await waitForStateCheckpoint(page, "FL");
  await expect(page).toHaveURL(/\/auto\/tiene-licencia\?state=FL$/u);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Atrás", exact: true }).click();
  await expect(page).toHaveURL(/\/auto\/estado-donde-vive\?state=FL$/u);
  await waitForController(page);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeDisabled();
  await activeStep(page).locator("input").fill("Texas");
  await activeStep(page).getByRole("button", { name: /Texas/u }).click();
  await waitForStateCheckpoint(page, "TX");
  await expect(page).toHaveURL(/\/auto\/tiene-licencia\?state=FL$/u);
  await page.getByRole("button", { name: "Atrás", exact: true }).click();
  await expect(page).toHaveURL(/\/auto\/estado-donde-vive\?state=FL$/u);
  await page.reload();
  await waitForController(page);
  await expect(activeStep(page).locator("input")).toHaveValue(/^(TX|Texas)$/u);
});

test("generic home stays independent after choosing a supported state @cross-browser", async ({ page }, testInfo) => {
  await page.goto("/hogar");
  await expect(page).toHaveURL(/\/hogar\/inicio$/u);
  await waitForController(page);
  await expectWelcomeLayout(page);
  await page.screenshot({ path: testInfo.outputPath("generic-home.png"), fullPage: true });
  await page.getByRole("button", { name: "Empezar mi cotización" }).click();
  await expect(page).toHaveURL(/\/hogar\/estado-de-la-propiedad$/u);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeDisabled();
  await activeStep(page).locator("input").fill("Texas");
  await activeStep(page).getByRole("button", { name: /Texas/u }).click();
  await expect(page).toHaveURL(/\/hogar\/dueno-o-renta$/u);
  await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeEnabled();
  await expect(activeStep(page).getByRole("heading", { name: /dueño|renta/iu })).toBeVisible();
});

test("existing state welcome keeps its one-button and first-question navigation @cross-browser", async ({ page }) => {
  await page.goto("/hogar/tx/inicio");
  await waitForController(page);
  await expectWelcomeLayout(page);
  await page.getByRole("button", { name: "Empezar mi cotización" }).click();
  await expect(page).toHaveURL(/\/hogar\/tx\/propiedad-en-texas$/u);
  const back = page.getByRole("button", { name: "Atrás", exact: true });
  await expect(back).toBeVisible();
  await expect(back).toBeDisabled();
  await activeStep(page).getByRole("radio", { name: /Si/u }).check();
  await expect(page).toHaveURL(/\/hogar\/tx\/dueno-o-renta$/u);
  await expect(back).toBeEnabled();
  expect((await back.boundingBox())!.height).toBeGreaterThan(40);
});
