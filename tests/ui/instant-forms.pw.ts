import { expect, test, type Page } from "@playwright/test";

import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/persistence/checkpoints";

const areaCode = "tn";
const appUrl = "http://127.0.0.1:51234";
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
    await expect(page).toHaveURL(/\/tn\/vive-en-tennessee$/u);

    await clickActiveOption(page, "Si");
    await expect(page).toHaveURL(/\/tn\/tiene-licencia$/u);

    await page.goBack();
    await expect(page).toHaveURL(/\/tn\/vive-en-tennessee$/u);

    await page.goForward();
    await expect(page).toHaveURL(/\/tn\/tiene-licencia$/u);
  });

  test("error modal appears without inline layout errors", async ({ page }) => {
    await page.goto("/tn/vive-en-tennessee");
    await page.getByRole("button", { name: "Siguiente" }).click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText("Esta respuesta es requerida.")).toBeVisible();
    await expect(page.locator("#form-error")).toHaveCount(0);
    await expect(page).toHaveScreenshot("error-modal.png");
  });

  test("autocomplete suggestions scroll internally and select a normalized state", async ({ page }) => {
    await seedCheckpoint(page, { belongs_to_state: "no" });
    await page.goto("/tn/estado-donde-vive");

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
    await expect(page).toHaveURL(/\/tn\/tiene-licencia$/u);
  });

  test("phone mask accepts +1 input and final submission succeeds", async ({ page }) => {
    await seedCheckpoint(page, {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
    });
    await page.goto("/tn/telefono");

    const phoneInput = activeStep(page).getByPlaceholder("Escriba su telefono aquí");
    await phoneInput.fill("+1 (615) 555-1234");
    await expect(phoneInput).toHaveValue("+1 (615) 555-1234");

    await phoneInput.press("5");
    await expect(phoneInput).toHaveValue("+1 (615) 555-1234");

    const submissionResponse = page.waitForResponse(/\/api\/forms\/tn\/submissions/u);
    if (await page.evaluate("window.matchMedia('(max-width: 560px)').matches")) {
      await phoneInput.evaluate((input) => input.blur());
    } else {
      await page.locator("#next-button").click();
    }
    await expect((await submissionResponse).status()).toBe(201);
    await expect(page.getByRole("heading", { name: "Gracias." })).toBeVisible();
  });

  test("key visual states remain stable", async ({ page }) => {
    await page.goto("/tn/vive-en-tennessee");
    await expect(page).toHaveScreenshot("first-choice.png");

    await seedCheckpoint(page, { belongs_to_state: "no" });
    await page.goto("/tn/estado-donde-vive");
    await activeStep(page).getByPlaceholder("Escriba su estado aquí").fill("a");
    await expect(page).toHaveScreenshot("autocomplete-suggestions.png");

    await seedCheckpoint(page, { ...preContactAnswers, matching_offer: "completed" });
    await page.goto("/tn/buscando-oferta");
    await expect(page.getByText("Encontramos agentes listos para cotizarle.")).toBeVisible();
    await expect(page).toHaveScreenshot("matching-success.png");

    await seedCheckpoint(page, seenMatchingAnswers);
    await page.goto("/tn/nombre");
    await expect(page).toHaveScreenshot("contact-name.png");

    await seedCheckpoint(page, { ...seenMatchingAnswers, first_name: "Ana", last_name: "Lopez" });
    await page.goto("/tn/telefono");
    await expect(page).toHaveScreenshot("phone-step.png");
  });
});

function activeStep(page: Page) {
  return page.locator('.step[aria-hidden="false"]');
}

async function clickActiveOption(page: Page, label: string): Promise<void> {
  await activeStep(page).locator(".option", { hasText: label }).first().click();
}

async function seedCheckpoint(page: Page, answers: Record<string, string>): Promise<void> {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: getCheckpointCookieName(areaCode),
      value: encodeCheckpointAnswers(answers),
      url: appUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
