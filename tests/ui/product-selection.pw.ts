import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.route("**/_instant/scripts/**", (route) => route.fulfill({
    contentType: "application/javascript", body: "",
  }));
  await page.route("**/_instant/**/proxy**", (route) => route.fulfill({ body: "" }));
});

function trackProductSubmissions(page: Page): string[] {
  const products: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/producto") {
      products.push(new URLSearchParams(request.postData() ?? "").get("product") ?? "");
    }
  });
  return products;
}

const products = [
  ["auto", "Seguro de auto", "/auto/estado-donde-vive"],
  ["hogar", "Seguro de hogar", "/hogar/estado-de-la-propiedad"],
] as const;

for (const [product, label, destination] of products) {
  test(`product selection advances automatically for ${label} @cross-browser`, async ({ page, isMobile }, testInfo) => {
    const submissions = trackProductSubmissions(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Empezar mi cotización" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/producto");
    await expect(page.getByRole("heading", { name: "¿Qué desea asegurar?" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("product-selection.png"), fullPage: true });
    const option = page.getByText(label, { exact: true });
    if (isMobile) await option.tap();
    else await option.click();
    await expect(page).toHaveURL((url) => url.pathname === destination);
    expect(submissions).toEqual([product]);
  });
}

test("product selection advances with the keyboard @cross-browser", async ({ page }) => {
  await page.goto("/producto");
  const home = page.getByRole("radio", { name: /Seguro de hogar/u });
  await home.focus();
  await home.press("Space");
  await expect(page).toHaveURL((url) => url.pathname === "/hogar/estado-de-la-propiedad");
});

test("initial pageshow cannot cancel a pending product selection @cross-browser", async ({ page }) => {
  await page.goto("/producto");
  await page.evaluate(`(() => {
    document.querySelector('input[value="auto"]').click();
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
  })()`);
  await expect(page).toHaveURL((url) => url.pathname === "/auto/estado-donde-vive");
});

test("rapid product changes submit only the latest choice @cross-browser", async ({ page }) => {
  const submissions = trackProductSubmissions(page);
  await page.goto("/producto");
  await page.evaluate(`(() => {
    const auto = document.querySelector('input[value="auto"]');
    const home = document.querySelector('input[value="hogar"]');
    auto.click();
    home.click();
    home.click();
  })()`);
  await expect(page).toHaveURL((url) => url.pathname === "/hogar/estado-de-la-propiedad");
  expect(submissions).toEqual(["hogar"]);
});

test("manual continue and pending auto-advance cannot submit twice @cross-browser", async ({ page }) => {
  const submissions = trackProductSubmissions(page);
  await page.route("**/producto", async (route) => {
    if (route.request().method() === "POST") {
      // Hold navigation past the auto-advance deadline to expose duplicate submissions.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await route.continue();
  });
  await page.goto("/producto");
  await page.evaluate(`(() => {
    document.querySelector('input[value="auto"]').click();
    const form = document.querySelector("[data-product-selection]");
    form.querySelector('button[type="submit"]').click();
    form.requestSubmit();
  })()`);
  await expect(page).toHaveURL((url) => url.pathname === "/auto/estado-donde-vive");
  expect(submissions).toEqual(["auto"]);
});

test("browser Back does not auto-submit and clicking a restored choice works @cross-browser", async ({ page }) => {
  const submissions = trackProductSubmissions(page);
  await page.goto("/producto");
  await page.getByRole("radio", { name: /Seguro de auto/u }).check();
  await expect(page).toHaveURL((url) => url.pathname === "/auto/estado-donde-vive");
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/producto");
  const auto = page.getByRole("radio", { name: /Seguro de auto/u });
  // Browsers differ in whether native radio state is restored without BFCache.
  await page.evaluate('document.querySelector(\'input[value="auto"]\').checked = true');
  await page.waitForTimeout(300);
  expect(submissions).toEqual(["auto"]);
  await auto.click();
  await expect(page).toHaveURL((url) => url.pathname === "/auto/estado-donde-vive");
  expect(submissions).toEqual(["auto", "auto"]);
});

test("persisted pageshow resets the submission guard without resubmitting @cross-browser", async ({ page }) => {
  const submissions = trackProductSubmissions(page);
  await page.goto("/producto");
  await page.evaluate(`(() => {
    const form = document.querySelector("[data-product-selection]");
    form.addEventListener("submit", (event) => event.preventDefault(), { once: true });
    document.querySelector('input[value="auto"]').click();
    form.requestSubmit();
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  })()`);
  await page.waitForTimeout(300);
  expect(submissions).toEqual([]);
  await page.getByRole("radio", { name: /Seguro de auto/u }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/auto/estado-donde-vive");
  expect(submissions).toEqual(["auto"]);
});

test.describe("native product selection fallback", () => {
  test.use({ javaScriptEnabled: false });

  for (const [product, label, destination] of products) {
    test(`continue works without JavaScript for ${label} @cross-browser`, async ({ page }) => {
      const submissions = trackProductSubmissions(page);
      await page.goto("/");
      await page.getByRole("link", { name: "Empezar mi cotización" }).click();
      await page.getByRole("radio", { name: new RegExp(label, "u") }).check();
      await expect(page).toHaveURL((url) => url.pathname === "/producto");
      expect(submissions).toEqual([]);
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === destination);
      expect(submissions).toEqual([product]);
    });
  }
});
