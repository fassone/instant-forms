import { expect, test, type Page } from "@playwright/test";

import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";

const routeKey = "tn_custom";
const appPort = Number(process.env.PLAYWRIGHT_PORT ?? 51234);
const appUrl = `http://127.0.0.1:${appPort}`;
const trustedFormCertUrl = "https://cert.trustedform.com/454a35b802f3e7b63ffabb4efedb7c6ebe67886c";
const preContactAnswers = {
  belongs_to_state: "yes",
  has_license: "yes",
  has_insurance: "no",
  is_clean_title: "yes",
  number_of_registered_cars: "1",
};
const seenMatchingAnswers = {
  ...preContactAnswers,
  matching_offer: "seen",
};

test.describe("instant routed form UI", () => {
  test("choice auto-advance works with browser back and forward", async ({ page }) => {
    await page.goto("/tn");
    await expect(page).toHaveURL(/\/tn\/custom\/vive-en-tennessee$/u);

    await clickActiveOption(page, "Si");
    await expect(page).toHaveURL(/\/tn\/custom\/tiene-licencia$/u);

    await page.goBack();
    await expect(page).toHaveURL(/\/tn\/custom\/vive-en-tennessee$/u);

    await page.goForward();
    await expect(page).toHaveURL(/\/tn\/custom\/tiene-licencia$/u);
  });

  test("production transition asset swaps steps without a document navigation", async ({ page }) => {
    await page.goto("/tn/custom/vive-en-tennessee");
    const transitionAssetUrl = await getTransitionAssetUrl(page);

    if (!transitionAssetUrl) {
      return;
    }

    await waitForTransitionAsset(page, transitionAssetUrl);

    const documentRequests: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") {
        documentRequests.push(request.url());
      }
    });

    await clickActiveOption(page, "Si");
    await expect(page).toHaveURL(/\/tn\/custom\/tiene-licencia$/u);
    expect(documentRequests.filter((url) => url.includes("/tn/custom/tiene-licencia"))).toHaveLength(0);
  });

  test("production optimistic transitions do not wait for slow checkpoint responses", async ({ page }) => {
    await page.goto("/tn/custom/vive-en-tennessee");
    const transitionAssetUrl = await getTransitionAssetUrl(page);

    if (!transitionAssetUrl) {
      return;
    }

    await waitForTransitionAsset(page, transitionAssetUrl);

    let releasedCheckpoints = 0;
    await page.route("**/api/forms/tn_custom/checkpoints", async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      releasedCheckpoints += 1;
      await route.continue();
    });

    await clickActiveOption(page, "Si");
    await expect(page).toHaveURL(/\/tn\/custom\/tiene-licencia$/u, { timeout: 700 });
    expect(releasedCheckpoints).toBe(0);

    await clickActiveOption(page, "Si");
    await expect(page).toHaveURL(/\/tn\/custom\/tiene-seguro$/u, { timeout: 700 });
    expect(releasedCheckpoints).toBe(0);

    await expect.poll(() => releasedCheckpoints, { timeout: 2500 }).toBeGreaterThan(0);
  });

  test("checkpoint rejection rolls back the optimistic step and shows the modal", async ({ page }) => {
    await page.goto("/tn/custom/vive-en-tennessee");
    const transitionAssetUrl = await getTransitionAssetUrl(page);

    if (!transitionAssetUrl) {
      return;
    }

    await waitForTransitionAsset(page, transitionAssetUrl);
    await page.route("**/api/forms/tn_custom/checkpoints", async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          errors: [{ message: "No pudimos guardar esta respuesta." }],
        }),
      });
    });

    await clickActiveOption(page, "Si");
    await expect(page).toHaveURL(/\/tn\/custom\/tiene-licencia$/u, { timeout: 700 });
    await expect(page).toHaveURL(/\/tn\/custom\/vive-en-tennessee$/u);
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText("No pudimos guardar esta respuesta.")).toBeVisible();
  });

  test("error modal appears without inline layout errors", async ({ page }) => {
    await page.goto("/tn/custom/vive-en-tennessee");
    await page.getByRole("button", { name: "Siguiente" }).click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText("Esta respuesta es requerida.")).toBeVisible();
    await expect(page.locator("#form-error")).toHaveCount(0);
    await expect(page).toHaveScreenshot("error-modal.png");
  });

  test("autocomplete suggestions scroll internally and select a normalized state", async ({ page }) => {
    await seedCheckpoint(page, { belongs_to_state: "no" });
    await page.goto("/tn/custom/estado-donde-vive");

    const stateInput = activeStep(page).getByPlaceholder("Escriba su estado aquí");
    await stateInput.fill("a");

    const suggestions = activeStep(page).locator("[data-autocomplete-suggestions]");
    await expect
      .poll(() => suggestions.locator("[data-autocomplete-suggestion]").count())
      .toBeGreaterThan(3);
    await expect
      .poll(() => suggestions.evaluate((element) => element.scrollHeight > element.clientHeight))
      .toBe(true);
    await expect(activeStep(page).locator("[data-autocomplete-suggestions-shell]")).toHaveAttribute(
      "data-can-scroll-down",
      "true",
    );

    await suggestions.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(activeStep(page).locator("[data-autocomplete-suggestions-shell]")).toHaveAttribute(
      "data-can-scroll-up",
      "true",
    );

    await suggestions.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await suggestions.locator("[data-autocomplete-suggestion]").first().click();
    await expect(page).toHaveURL(/\/tn\/custom\/tiene-licencia$/u);
  });

  test("phone mask accepts +1 input and final submission succeeds", async ({ page }) => {
    await mockTrustedFormCertify(page);
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
    });
    await page.goto("/tn/custom/telefono");

    const phoneInput = activeStep(page).getByPlaceholder("Escriba su telefono aquí");
    await phoneInput.fill("+1 (615) 555-1234");
    await expect(phoneInput).toHaveValue("+1 (615) 555-1234");

    await phoneInput.press("5");
    await expect(phoneInput).toHaveValue("+1 (615) 555-1234");

    if (await page.evaluate("window.matchMedia('(max-width: 560px)').matches")) {
      await phoneInput.evaluate((input) => input.blur());
    } else {
      await page.getByRole("button", { name: "Siguiente" }).click();
    }
    await expect(page).toHaveURL(/\/tn\/custom\/consentimiento$/u);

    await activeStep(page).locator("[data-trusted-form-consent]").check();
    await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled();
    const submissionRequest = page.waitForRequest(/\/api\/forms\/tn_custom\/submissions/u);
    const submissionResponse = page.waitForResponse(/\/api\/forms\/tn_custom\/submissions/u);
    await page.getByRole("button", { name: "Enviar" }).click();
    expect(JSON.parse((await submissionRequest).postData() ?? "{}")).toMatchObject({
      trustedFormCertUrl,
    });
    await expect((await submissionResponse).status()).toBe(201);
    await expect(page.getByRole("heading", { name: "Gracias." })).toBeVisible();
  });

  test("TrustedForm consent waits for the certificate before submit", async ({ page }) => {
    await mockTrustedFormCertify(page, { delayMs: 1000 });
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    });
    await page.goto("/tn/custom/consentimiento");

    await expect(page.getByRole("button", { name: "Preparando..." })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  test("TrustedForm script does not execute before the consent step", async ({ page }) => {
    let partytownRequests = 0;
    let trustedFormProxyRequests = 0;
    let trustedFormDirectRequests = 0;
    await mockPartytownRuntime(page, () => {
      partytownRequests += 1;
    });
    await page.route("**/_instant/scripts/**/tfc.js**", async (route) => {
      trustedFormProxyRequests += 1;
      await route.fulfill({
        contentType: "application/javascript",
        body: getMockTrustedFormScript(25),
      });
    });
    await page.route("https://api.trustedform.com/trustedform.js**", async (route) => {
      trustedFormDirectRequests += 1;
      await route.fulfill({
        contentType: "application/javascript",
        body: getMockTrustedFormScript(25),
      });
    });
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
    });
    await page.goto("/tn/custom/telefono");
    await page.waitForTimeout(300);

    await expect
      .poll(() =>
        page.evaluate("Boolean(window.__TRUSTED_FORM_SCRIPT_EXECUTED__)"),
      )
      .toBe(false);
    expect(partytownRequests).toBe(0);
    expect(trustedFormProxyRequests).toBe(0);
    expect(trustedFormDirectRequests).toBe(0);

    const phoneInput = activeStep(page).getByPlaceholder("Escriba su telefono aquí");
    await phoneInput.fill("+1 (615) 555-1234");
    if (await page.evaluate("window.matchMedia('(max-width: 560px)').matches")) {
      await phoneInput.evaluate((input) => input.blur());
    } else {
      await page.getByRole("button", { name: "Siguiente" }).click();
    }

    await expect(page).toHaveURL(/\/tn\/custom\/consentimiento$/u);
    expect(partytownRequests).toBe(0);
    await expect.poll(() => trustedFormProxyRequests).toBeGreaterThan(0);
    expect(trustedFormDirectRequests).toBe(0);
    await expect
      .poll(() =>
        page.evaluate("Boolean(window.__TRUSTED_FORM_SCRIPT_EXECUTED__)"),
      )
      .toBe(true);
    await page.waitForTimeout(150);
    expect(trustedFormProxyRequests).toBe(1);
  });

  test("TrustedForm script failure allows fallback submission when configured", async ({ page }) => {
    await mockPartytownRuntime(page);
    await page.route("**/_instant/scripts/**/tfc.js**", async (route) => {
      await route.abort();
    });
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    });
    await page.goto("/tn/custom/consentimiento");

    await expect(page.getByRole("button", { name: "Enviar" })).toBeEnabled({ timeout: 7000 });
    await expect(page.getByRole("alertdialog")).toBeHidden();

    await activeStep(page).locator("[data-trusted-form-consent]").check();
    const submissionRequest = page.waitForRequest(/\/api\/forms\/tn_custom\/submissions/u);
    const submissionResponse = page.waitForResponse(/\/api\/forms\/tn_custom\/submissions/u);
    await page.getByRole("button", { name: "Enviar" }).click();
    expect(JSON.parse((await submissionRequest).postData() ?? "{}")).not.toHaveProperty("trustedFormCertUrl");
    await expect((await submissionResponse).status()).toBe(201);
  });

  test("key visual states remain stable", async ({ page }) => {
    await page.goto("/tn/custom/vive-en-tennessee");
    await expect(page).toHaveScreenshot("first-choice.png");

    await seedCheckpoint(page, { belongs_to_state: "no" });
    await page.goto("/tn/custom/estado-donde-vive");
    await activeStep(page).getByPlaceholder("Escriba su estado aquí").fill("a");
    await expect(page).toHaveScreenshot("autocomplete-suggestions.png");

    await seedCheckpoint(page, { ...preContactAnswers, matching_offer: "completed" });
    await page.goto("/tn/custom/buscando-oferta");
    await expect(page.getByText("Encontramos agentes listos para cotizarle.")).toBeVisible();
    await expect(page).toHaveScreenshot("matching-success.png");

    await seedCheckpoint(page, seenMatchingAnswers);
    await page.goto("/tn/custom/nombre");
    await expect(page).toHaveScreenshot("contact-name.png");

    await seedCheckpoint(page, { ...seenMatchingAnswers, first_name: "Ana", last_name: "Lopez" });
    await page.goto("/tn/custom/telefono");
    await expect(page).toHaveScreenshot("phone-step.png");
  });
});

function activeStep(page: Page) {
  return page.locator('[data-step][aria-hidden="false"]');
}

async function getTransitionAssetUrl(page: Page): Promise<string> {
  return page.evaluate("String(window.__FORM_CONFIG__?.transitionAssetUrl ?? '')");
}

async function waitForTransitionAsset(page: Page, transitionAssetUrl: string): Promise<void> {
  await page.waitForFunction(
    (assetUrl) =>
      performance
        .getEntriesByType("resource")
        .some((entry) => entry.name.includes(String(assetUrl))),
    transitionAssetUrl,
  );
}

async function clickActiveOption(page: Page, label: string): Promise<void> {
  await activeStep(page).locator("[data-option]", { hasText: label }).first().click();
}

async function seedCheckpoint(page: Page, answers: Record<string, string>): Promise<void> {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: getCheckpointCookieName(routeKey),
      value: encodeCheckpointAnswers(answers),
      url: appUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function mockTrustedFormCertify(page: Page, options: { delayMs?: number } = {}): Promise<void> {
  const delayMs = options.delayMs ?? 25;
  await mockPartytownRuntime(page);
  await page.route("**/_instant/scripts/**/tfc.js**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: getMockTrustedFormScript(delayMs),
    });
  });
}

async function mockPartytownRuntime(page: Page, onRequest: () => void = () => undefined): Promise<void> {
  await page.route("**/~partytown/partytown.js", async (route) => {
    onRequest();
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        (function () {
          function executePartytownScripts() {
            document.querySelectorAll('script[type="text/partytown"]').forEach(function (script) {
              if (script.dataset.partytownExecuted === "true") {
                return;
              }
              script.dataset.partytownExecuted = "true";
              var executable = document.createElement("script");
              executable.async = true;
              if (script.src) {
                executable.src = script.src;
              } else {
                executable.textContent = script.textContent;
              }
              document.body.appendChild(executable);
            });
          }
          window.addEventListener("ptupdate", executePartytownScripts);
          window.setTimeout(executePartytownScripts, 0);
        })();
      `,
    });
  });
}

function getMockTrustedFormScript(delayMs: number): string {
  return `
    window.__TRUSTED_FORM_SCRIPT_EXECUTED__ = true;
    window.setTimeout(function () {
      var form = document.querySelector('[data-tf-element-role="offer"]') || document.querySelector("form");
      if (!form || form.querySelector('[name="xxTrustedFormCertUrl"]')) {
        return;
      }
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = "xxTrustedFormCertUrl";
      input.value = "${trustedFormCertUrl}";
      form.appendChild(input);
    }, ${delayMs});
  `;
}
