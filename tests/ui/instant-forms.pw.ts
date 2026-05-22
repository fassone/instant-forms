import { expect, test, type Page } from "@playwright/test";

import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";

const routeKey = "tn_custom";
const appPort = Number(process.env.PLAYWRIGHT_PORT ?? 51234);
const appUrl = `http://127.0.0.1:${appPort}`;
const trustedFormCertUrl = "https://cert.trustedform.com/454a35b802f3e7b63ffabb4efedb7c6ebe67886c";
const trustedFormReviewTitle = "Antes de cotizar";
const trustedFormReviewDescription = "Ya tenemos posibles opciones para usted. Confirme que sus datos estén correctos antes de continuar.";
const trustedFormSubmitLabel = "Cotizar";
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

  test("preloaded dynamic consent content stays hidden on earlier steps", async ({ page }) => {
    let consentResolutionRequests = 0;
    await page.route("**/api/forms/tn_custom/resolutions", async (route) => {
      const postData = route.request().postDataJSON() as { stepKey?: string } | undefined;
      if (postData?.stepKey === "trustedform_consent") {
        consentResolutionRequests += 1;
      }
      await route.continue();
    });
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      belongs_to_state: "no",
      residence_state: "AR",
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    });
    await page.goto("/tn/custom/vive-en-tennessee");
    const transitionAssetUrl = await getTransitionAssetUrl(page);

    if (!transitionAssetUrl) {
      return;
    }

    await waitForTransitionAsset(page, transitionAssetUrl);
    await expect.poll(() => consentResolutionRequests).toBeGreaterThan(0);
    await expect(activeStep(page).getByRole("heading", { name: "¿Usted vive en Tennessee?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: trustedFormReviewTitle })).toHaveCount(0);
    await expect(activeStep(page).locator("[data-trusted-form-review-scroll]")).toHaveCount(0);
  });

  test("dynamic consent preload waits until route guards allow the consent step", async ({ page }) => {
    let consentResolutionRequests = 0;
    await page.route("**/api/forms/tn_custom/resolutions", async (route) => {
      const postData = route.request().postDataJSON() as { stepKey?: string } | undefined;
      if (postData?.stepKey === "trustedform_consent") {
        consentResolutionRequests += 1;
      }
      await route.continue();
    });
    await seedCheckpoint(page, {
      ...preContactAnswers,
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    });
    await page.goto("/tn/custom/vive-en-tennessee");
    const transitionAssetUrl = await getTransitionAssetUrl(page);

    if (!transitionAssetUrl) {
      return;
    }

    await waitForTransitionAsset(page, transitionAssetUrl);
    await page.waitForTimeout(250);
    expect(consentResolutionRequests).toBe(0);
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
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeEnabled();
    await page.getByRole("button", { name: "Siguiente" }).click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText("Esta respuesta es requerida.")).toBeVisible();
    await expect(page.locator("#form-error")).toHaveCount(0);
    await expect(page).toHaveScreenshot("error-modal.png");
  });

  test("matching step uses the shared spinner while the offer is loading", async ({ page }) => {
    await seedCheckpoint(page, preContactAnswers);
    await page.goto("/tn/custom/buscando-oferta");

    await assertSpinnerOnlyLoadingButton(page);
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeEnabled({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "Siguiente" })).toHaveText("Siguiente");
  });

  test("fallback navigation waits show the shared spinner", async ({ page }) => {
    await page.route("**/_instant/forms/**/transition.js", async (route) => {
      await route.abort();
    });
    await page.goto("/tn/custom/vive-en-tennessee");
    await page.route("**/api/forms/tn_custom/checkpoints", async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      await route.continue();
    });

    await clickActiveOption(page, "Si");
    await assertSpinnerOnlyLoadingButton(page);
    await expect(page).toHaveURL(/\/tn\/custom\/tiene-licencia$/u);
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

    await continueTrustedFormReview(page);
    await activeStep(page).locator("[data-trusted-form-consent]").check();
    await expect(page.getByRole("button", { name: trustedFormSubmitLabel })).toBeEnabled();
    const submissionRequest = page.waitForRequest(/\/api\/forms\/tn_custom\/native-submissions/u);
    await page.getByRole("button", { name: trustedFormSubmitLabel }).click();
    expect((await submissionRequest).postData() ?? "").toContain(
      "trustedFormCertUrl=https%3A%2F%2Fcert.trustedform.com%2F454a35b802f3e7b63ffabb4efedb7c6ebe67886c",
    );
    await expect(page.getByRole("heading", { name: "Gracias." })).toBeVisible();
  });

  test("TrustedForm review description is compact and regular weight", async ({ page }) => {
    await mockTrustedFormCertify(page);
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    });
    await page.goto("/tn/custom/consentimiento");

    const step = activeStep(page);
    const description = step.locator("[data-question-description]");
    await expect(step.getByRole("heading", { name: trustedFormReviewTitle })).toBeVisible();
    await expect(description).toBeVisible();
    await expect(description).toHaveCSS("font-weight", "400");
    const reviewShell = step.locator("[data-trusted-form-review-scroll-shell]");
    const reviewScroll = step.locator("[data-trusted-form-review-scroll]");
    const reviewTopFade = step.locator("[data-trusted-form-review-scroll-fade-top]");
    const reviewBottomFade = step.locator("[data-trusted-form-review-scroll-fade-bottom]");
    await expect(step.locator("[data-trusted-form-field-bank] [data-tf-element-role]")).toHaveCount(0);
    await expect(
      step.locator('[data-trusted-form-substep="review"] [data-tf-element-role="consent-grantor-name"]'),
    ).toHaveText("Ana Lopez");
    await expect(
      step.locator('[data-trusted-form-substep="review"] [data-tf-element-role="consent-grantor-phone"]'),
    ).toHaveText("(615) 555-1234");
    await expect(reviewShell).toHaveAttribute("data-can-scroll-up", "false");
    const canReviewScroll = await reviewScroll.evaluate(
      (element) => element.scrollHeight > element.clientHeight + 1,
    );
    if (canReviewScroll) {
      await expect(reviewShell).toHaveAttribute("data-can-scroll-down", "true");
      await expect(reviewBottomFade).toHaveCSS("opacity", "1");
    } else {
      await expect(reviewShell).toHaveAttribute("data-can-scroll-down", "false");
      await expect(reviewBottomFade).toHaveCSS("opacity", "0");
    }

    const titleBox = await step.locator("[data-question-title]").boundingBox();
    const descriptionBox = await description.boundingBox();
    const reviewBox = await reviewScroll.boundingBox();
    const continueBox = await page.getByRole("button", { name: "Continuar" }).boundingBox();
    if (!titleBox || !descriptionBox || !reviewBox || !continueBox) {
      throw new Error("Expected TrustedForm review layout boxes to be present.");
    }

    const metrics = {
      titleToDescriptionGap: descriptionBox.y - (titleBox.y + titleBox.height),
      descriptionToReviewGap: reviewBox.y - (descriptionBox.y + descriptionBox.height),
      reviewBottomToActionsGap: continueBox.y - (reviewBox.y + reviewBox.height),
    };

    expect(metrics.titleToDescriptionGap).toBeLessThan(80);
    expect(metrics.descriptionToReviewGap).toBeLessThan(80);
    expect(metrics.reviewBottomToActionsGap).toBeGreaterThanOrEqual(-1);

    if (canReviewScroll) {
      await reviewScroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await expect(reviewShell).toHaveAttribute("data-can-scroll-up", "true");
      await expect(reviewShell).toHaveAttribute("data-can-scroll-down", "false");
      await expect(reviewTopFade).toHaveCSS("opacity", "1");
      await expect(reviewBottomFade).toHaveCSS("opacity", "0");
    }
  });

  test("TrustedForm consent accepts submit while the certificate is still preparing", async ({ page }) => {
    await mockTrustedFormCertify(page, { delayMs: 1000 });
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    });
    await page.goto("/tn/custom/consentimiento");

    await expect(page.getByRole("button", { name: "Preparando..." })).toBeHidden();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();

    const reviewButton = page.getByRole("button", { name: "Continuar" });
    const buttonBoxBeforeLoading = await reviewButton.boundingBox();
    if (!buttonBoxBeforeLoading) {
      throw new Error("Expected the review button to have a visible bounding box before loading.");
    }
    await reviewButton.click();

    const loadingButton = await assertSpinnerOnlyLoadingButton(page);
    const buttonBoxWhileLoading = await loadingButton.boundingBox();
    if (!buttonBoxWhileLoading) {
      throw new Error("Expected the loading button to keep a visible bounding box.");
    }
    expect(Math.abs(buttonBoxWhileLoading.width - buttonBoxBeforeLoading.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(buttonBoxWhileLoading.height - buttonBoxBeforeLoading.height)).toBeLessThanOrEqual(1);

    await expect(page.getByRole("button", { name: trustedFormSubmitLabel })).toBeEnabled();

    await activeStep(page).locator("[data-trusted-form-consent]").check();
    await expect(activeStep(page).locator("[data-consent-summary]")).toHaveCount(0);
    await expect(
      activeStep(page).locator('[data-trusted-form-substep="consent"] [data-tf-element-role="consent-grantor-name"]'),
    ).toHaveText("Ana Lopez");
    await expect(
      activeStep(page).locator('[data-trusted-form-substep="consent"] [data-tf-element-role="consent-grantor-phone"]'),
    ).toHaveText("(615) 555-1234");
    const submitButton = page.getByRole("button", { name: trustedFormSubmitLabel });
    const submissionRequest = page.waitForRequest(/\/api\/forms\/tn_custom\/native-submissions/u);
    await submitButton.click();

    expect((await submissionRequest).postData() ?? "").toContain(
      "trustedFormCertUrl=https%3A%2F%2Fcert.trustedform.com%2F454a35b802f3e7b63ffabb4efedb7c6ebe67886c",
    );
    await expect(page.getByRole("heading", { name: "Gracias." })).toBeVisible();
  });

  test("TrustedForm consent copy scrolls on small mobile without covering actions", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 420 });
    await mockTrustedFormCertify(page);
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Michel",
      last_name: "Fassone",
      phone_number: "+17864746654",
    });
    await page.goto("/tn/custom/consentimiento");
    await expect(page.locator('img[alt="Seguros Aseguranza"]')).toBeHidden();
    await expect(page.locator("[data-step-count]")).toBeHidden();
    await continueTrustedFormReview(page);
    await expect(page.locator('img[alt="Seguros Aseguranza"]')).toBeHidden();
    await expect(page.locator("[data-step-count]")).toBeHidden();

    const step = activeStep(page);
    const consentShell = step.locator("[data-trusted-form-consent-scroll-shell]");
    const consentScroll = step.locator("[data-trusted-form-consent-scroll]");
    const topFade = step.locator("[data-trusted-form-consent-scroll-fade-top]");
    const bottomFade = step.locator("[data-trusted-form-consent-scroll-fade-bottom]");

    await expect(consentShell).toBeVisible();
    await expect(consentScroll).toBeVisible();
    await consentScroll.evaluate((element) => {
      element.style.height = "40px";
      element.style.maxHeight = "40px";
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(consentShell).toHaveAttribute("data-can-scroll-up", "false");
    await expect(consentShell).toHaveAttribute("data-can-scroll-down", "true");
    await expect(bottomFade).toHaveCSS("opacity", "1");

    const consentBox = await step.locator('[data-tf-element-role="consent-language"]').boundingBox();
    const submitBox = await page.getByRole("button", { name: trustedFormSubmitLabel }).boundingBox();
    if (!consentBox || !submitBox) {
      throw new Error("Expected consent language and submit button boxes to be visible.");
    }
    expect(consentBox.y + consentBox.height).toBeLessThanOrEqual(submitBox.y);

    await consentScroll.evaluate((element) => {
      element.scrollTop = Math.floor(element.scrollHeight / 2);
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(consentShell).toHaveAttribute("data-can-scroll-up", "true");
    await expect(topFade).toHaveCSS("opacity", "1");

    await consentScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(consentShell).toHaveAttribute("data-can-scroll-down", "false");
    await expect(bottomFade).toHaveCSS("opacity", "0");
  });

  test("mobile fluid scale shrinks layout dimensions below 500px", async ({ page }) => {
    const widths = [500, 390, 360, 320] as const;
    const measurements: Array<{ width: number; titleFont: number; buttonHeight: number; panelPadding: number }> = [];

    for (const width of widths) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/tn/custom/vive-en-tennessee");
      measurements.push(
        await page.evaluate(() => {
          type BrowserElement = {
            getBoundingClientRect: () => { height: number };
          };
          const browserScope = globalThis as unknown as {
            document: { querySelector: (selector: string) => unknown };
            getComputedStyle: (element: unknown) => { fontSize: string; paddingLeft: string };
            innerWidth: number;
          };
          const title = browserScope.document.querySelector("[data-question-title]");
          const button = browserScope.document.querySelector('button[name="next"]') as BrowserElement | null;
          const panel = browserScope.document.querySelector("form");
          if (!title || !button || !panel) {
            throw new Error("Expected form elements to be present.");
          }
          const titleStyles = browserScope.getComputedStyle(title);
          const buttonBox = button.getBoundingClientRect();
          const panelStyles = browserScope.getComputedStyle(panel);
          return {
            width: browserScope.innerWidth,
            titleFont: Number.parseFloat(titleStyles.fontSize),
            buttonHeight: buttonBox.height,
            panelPadding: Number.parseFloat(panelStyles.paddingLeft),
          };
        }),
      );
    }

    for (let index = 1; index < measurements.length; index += 1) {
      expect(measurements[index]!.titleFont).toBeLessThan(measurements[index - 1]!.titleFont);
      expect(measurements[index]!.buttonHeight).toBeLessThan(measurements[index - 1]!.buttonHeight);
      expect(measurements[index]!.panelPadding).toBeLessThan(measurements[index - 1]!.panelPadding);
    }
  });

  test("unchecked TrustedForm consent stays clickable and shows the modal", async ({ page }) => {
    await mockTrustedFormCertify(page);
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    });
    let submissionRequests = 0;
    await page.route("**/api/forms/tn_custom/native-submissions", async (route) => {
      submissionRequests += 1;
      await route.continue();
    });
    await page.goto("/tn/custom/consentimiento");
    await continueTrustedFormReview(page);

    const submitButton = page.getByRole("button", { name: trustedFormSubmitLabel });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText("Debe aceptar el consentimiento para enviar la solicitud.")).toBeVisible();
    expect(submissionRequests).toBe(0);
    await expect(submitButton).toBeEnabled();
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
    await expect(page.locator('input[name="xxTrustedFormCertUrl"]')).toHaveCount(0);
    expect(partytownRequests).toBeLessThanOrEqual(1);
    await expect.poll(() => trustedFormProxyRequests).toBeGreaterThan(0);
    const preConsentPartytownRequests = partytownRequests;
    const preConsentProxyRequests = trustedFormProxyRequests;
    expect(trustedFormDirectRequests).toBe(0);

    const phoneInput = activeStep(page).getByPlaceholder("Escriba su telefono aquí");
    await phoneInput.fill("+1 (615) 555-1234");
    if (await page.evaluate("window.matchMedia('(max-width: 560px)').matches")) {
      await phoneInput.evaluate((input) => input.blur());
    } else {
      await page.getByRole("button", { name: "Siguiente" }).click();
    }

    await expect(page).toHaveURL(/\/tn\/custom\/consentimiento$/u);
    await continueTrustedFormReview(page);
    expect(partytownRequests).toBeGreaterThanOrEqual(preConsentPartytownRequests);
    expect(trustedFormDirectRequests).toBe(0);
    await expect
      .poll(() =>
        page.evaluate("Boolean(window.__TRUSTED_FORM_SCRIPT_EXECUTED__)"),
      )
      .toBe(true);
    await page.waitForTimeout(150);
    expect(trustedFormProxyRequests).toBeGreaterThanOrEqual(preConsentProxyRequests);
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

    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("button", { name: trustedFormSubmitLabel })).toBeEnabled({ timeout: 7000 });
    await expect(page.getByRole("alertdialog")).toBeHidden();

    await activeStep(page).locator("[data-trusted-form-consent]").check();
    const submissionRequest = page.waitForRequest(/\/api\/forms\/tn_custom\/native-submissions/u);
    await page.getByRole("button", { name: trustedFormSubmitLabel }).click();
    expect((await submissionRequest).postData() ?? "").not.toContain("trustedFormCertUrl=");
    await expect(page.getByRole("heading", { name: "Gracias." })).toBeVisible();
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

async function continueTrustedFormReview(page: Page): Promise<void> {
  await expect(activeStep(page).getByRole("heading", { name: trustedFormReviewTitle })).toBeVisible();
  await expect(activeStep(page).getByText(trustedFormReviewDescription)).toBeVisible();
  await expect(activeStep(page).locator("[data-trusted-form-review-scroll]")).toBeVisible();
  await expect(activeStep(page).locator(".trusted-form-review-label", { hasText: "Vive en Tennessee" })).toBeVisible();
  await expect(activeStep(page).locator('[data-trusted-form-substep="consent"]')).toBeHidden();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(activeStep(page).getByRole("heading", { name: trustedFormReviewTitle })).toBeVisible({ timeout: 7000 });
  await expect(activeStep(page).locator("[data-trusted-form-consent]")).toBeVisible({ timeout: 7000 });
  await expect(page.getByRole("button", { name: trustedFormSubmitLabel })).toBeEnabled({ timeout: 7000 });
  const isMobileChromeHidden = (page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 560;
  if (isMobileChromeHidden) {
    await expect(page.locator('img[alt="Seguros Aseguranza"]')).toBeHidden();
    await expect(page.locator("[data-step-count]")).toBeHidden();
  } else {
    await expect(page.locator('img[alt="Seguros Aseguranza"]')).toBeVisible();
    await expect(page.locator("[data-step-count]")).toBeVisible();
  }
}

async function assertSpinnerOnlyLoadingButton(page: Page) {
  const loadingButton = page.getByRole("button", { name: "Enviando..." });
  await expect(loadingButton).toBeDisabled();
  await expect(loadingButton).toHaveAttribute("aria-busy", "true");
  await expect(loadingButton).toHaveAttribute("data-loading", "true");
  await expect(loadingButton).toHaveText("");
  await expect(loadingButton).toHaveCSS("opacity", "0.45");
  const loadingSpinner = loadingButton.locator("span[aria-hidden='true']");
  await expect(loadingSpinner).toBeVisible();
  await expect(loadingSpinner).toHaveCSS("animation-name", "button-spinner-spin");
  await expect(loadingSpinner).not.toHaveCSS("animation-duration", "0s");
  return loadingButton;
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
