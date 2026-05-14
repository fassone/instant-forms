import { describe, expect, it } from "bun:test";
import { createStateAutocompleteItems, rankAutocompleteItems } from "../src/autocomplete";
import { encodeCheckpointAnswers, getCheckpointCookieName } from "../src/checkpoints";
import { getFormByStateCode, getQuestionSlug, isCountedStep } from "../src/forms";
import { renderFormPage } from "../src/render";
import { createFetchHandler } from "../src/server";
import { US_STATES, normalizeUsState } from "../src/us-states";
import { normalizeUsPhoneNumber, validateSubmission } from "../src/validation";

const preContactAnswers = {
  belongs_to_state: "yes",
  has_license: "yes",
  has_insurance: "no",
  is_clean_title: "yes",
  number_of_registered_cars: "1",
};

const outOfStatePreContactAnswers = {
  ...preContactAnswers,
  belongs_to_state: "no",
  residence_state: "TX",
};

const seenMatchingAnswers = {
  ...preContactAnswers,
  matching_offer: "seen",
};

const completedMatchingAnswers = {
  ...preContactAnswers,
  matching_offer: "completed",
};

const completedOutOfStateMatchingAnswers = {
  ...outOfStatePreContactAnswers,
  matching_offer: "completed",
};

const validAnswers = {
  ...preContactAnswers,
  first_name: "Ana",
  last_name: "Lopez",
  phone_number: "(615) 555-1234",
};

describe("form registry", () => {
  it("resolves the Tennessee form by lowercase state code", () => {
    const form = getFormByStateCode("tn");

    expect(form?.stateCode).toBe("tn");
    expect(form?.id).toBe("1011189481863371");
  });

  it("keeps contact fields at the end of the flow", () => {
    const form = getFormByStateCode("tn");

    expect(form?.questions.map((question) => question.key).slice(-3)).toEqual([
      "first_name",
      "last_name",
      "phone_number",
    ]);
  });

  it("uses Spanish slugs for public step URLs", () => {
    const form = getRequiredTennesseeForm();

    expect(form.questions.map((question) => getQuestionSlug(question))).toEqual([
      "vive-en-tennessee",
      "estado-donde-vive",
      "tiene-licencia",
      "tiene-seguro",
      "titulo-limpio",
      "autos-a-asegurar",
      "buscando-oferta",
      "nombre",
      "apellido",
      "telefono",
    ]);
  });

  it("uses reusable counted-step semantics", () => {
    const form = getRequiredTennesseeForm();
    const firstQuestion = form.questions[0];
    const matchingQuestion = form.questions.find((question) => question.kind === "interstitial");

    expect(firstQuestion ? isCountedStep(firstQuestion) : undefined).toBe(true);
    expect(matchingQuestion ? isCountedStep(matchingQuestion) : undefined).toBe(false);
    expect(firstQuestion ? isCountedStep({ ...firstQuestion, countsAsStep: false }) : undefined).toBe(false);
    expect(matchingQuestion ? isCountedStep({ ...matchingQuestion, countsAsStep: true }) : undefined).toBe(true);
  });
});

describe("submission validation", () => {
  const form = getRequiredTennesseeForm();

  it("rejects missing answers", () => {
    const result = validateSubmission(form, { answers: { ...validAnswers, has_license: "" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "has_license",
        message: "This answer is required.",
      });
    }
  });

  it("rejects invalid choice option keys", () => {
    const result = validateSubmission(form, { answers: { ...validAnswers, belongs_to_state: "maybe" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "belongs_to_state",
        message: "Answer is not a valid option.",
      });
    }
  });

  it("rejects phone numbers that cannot normalize to one US number", () => {
    const result = validateSubmission(form, { answers: { ...validAnswers, phone_number: "615-555" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "phone_number",
        message: "Ingrese un número de teléfono válido de Estados Unidos.",
      });
    }
  });

  it("accepts formatted US phone numbers and normalizes them to E.164", () => {
    const result = validateSubmission(form, { answers: validAnswers }, "2026-05-13T00:00:00.000Z");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.answers.phone_number).toBe("+16155551234");
      expect(result.payload.stateCode).toBe("tn");
      expect(result.payload.formId).toBe("1011189481863371");
    }
  });

  it("requires residence state only when the visitor does not live in Tennessee", () => {
    const missingState = validateSubmission(form, { answers: { ...validAnswers, belongs_to_state: "no" } });
    const invalidState = validateSubmission(form, {
      answers: { ...validAnswers, belongs_to_state: "no", residence_state: "Not a state" },
    });
    const validNoPath = validateSubmission(
      form,
      { answers: { ...validAnswers, belongs_to_state: "no", residence_state: "Texas" } },
      "2026-05-13T00:00:00.000Z",
    );
    const staleYesPath = validateSubmission(
      form,
      { answers: { ...validAnswers, belongs_to_state: "yes", residence_state: "Not a state" } },
      "2026-05-13T00:00:00.000Z",
    );

    expect(missingState.ok).toBe(false);
    if (!missingState.ok) {
      expect(missingState.errors).toContainEqual({
        field: "residence_state",
        message: "This answer is required.",
      });
    }

    expect(invalidState.ok).toBe(false);
    if (!invalidState.ok) {
      expect(invalidState.errors).toContainEqual({
        field: "residence_state",
        message: "Ingrese un estado válido de Estados Unidos.",
      });
    }

    expect(validNoPath.ok).toBe(true);
    if (validNoPath.ok) {
      expect(validNoPath.payload.answers.residence_state).toBe("TX");
    }

    expect(staleYesPath.ok).toBe(true);
    if (staleYesPath.ok) {
      expect(staleYesPath.payload.answers.residence_state).toBeUndefined();
    }
  });
});

describe("US state normalization", () => {
  it.each([
    ["Texas", "TX"],
    ["tx", "TX"],
    ["New Mexico", "NM"],
    ["District of Columbia", "DC"],
    ["Washington D.C.", "DC"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeUsState(input)).toBe(expected);
  });

  it.each(["", "Not a state", "Ontario"])("rejects %s", (input) => {
    expect(normalizeUsState(input)).toBeUndefined();
  });
});

describe("autocomplete ranking", () => {
  const stateItems = createStateAutocompleteItems(US_STATES);

  it("returns no suggestions for an empty query", () => {
    expect(rankAutocompleteItems(stateItems, "")).toEqual([]);
  });

  it("ranks direct state names and codes ahead of state-name word matches", () => {
    const rankedValues = rankAutocompleteItems(stateItems, "C").map((item) => item.value);

    expect(rankedValues).toContain("CA");
    expect(rankedValues).toContain("CO");
    expect(rankedValues).toContain("CT");
    expect(rankedValues).toContain("DC");
    expect(rankedValues).toContain("NC");
    expect(rankedValues).toContain("SC");
    expect(rankedValues.slice(0, 3)).toEqual(["CA", "CO", "CT"]);
    expect(rankedValues.indexOf("CT")).toBeLessThan(rankedValues.indexOf("DC"));
    expect(rankedValues.indexOf("CT")).toBeLessThan(rankedValues.indexOf("NC"));
    expect(rankedValues.indexOf("CT")).toBeLessThan(rankedValues.indexOf("SC"));
  });

  it("ranks exact state code aliases highest", () => {
    expect(rankAutocompleteItems(stateItems, "DC")[0]?.value).toBe("DC");
    expect(rankAutocompleteItems(stateItems, "D.C.")[0]?.value).toBe("DC");
  });
});

describe("US phone normalization", () => {
  it.each([
    ["6155551234", "+16155551234"],
    ["(615) 555-1234", "+16155551234"],
    ["615-555-1234", "+16155551234"],
    ["615.555.1234", "+16155551234"],
    ["+1 (615) 555-1234", "+16155551234"],
    ["+16155551234", "+16155551234"],
    ["1 615 555 1234", "+16155551234"],
    ["16155551234", "+16155551234"],
    ["1-615-555-1234", "+16155551234"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeUsPhoneNumber(input)).toBe(expected);
  });

  it.each(["615-555", "1 615 555 123", "1615555123", "+1 615 555 12345", "+52 55 1234 5678", "", "not a phone"])(
    "rejects %s",
    (input) => {
      expect(normalizeUsPhoneNumber(input)).toBeUndefined();
    },
  );
});

describe("server routing", () => {
  it("redirects the root route to Tennessee", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("redirects Tennessee to the first unanswered step without a checkpoint", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/vive-en-tennessee");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("redirects Tennessee to the next unanswered step from a checkpoint", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn", {
        headers: {
          Cookie: createCheckpointCookie({
            belongs_to_state: "yes",
            has_license: "no",
          }),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/tiene-seguro");
  });

  it("redirects Tennessee to the residence-state step after a no answer", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn", {
        headers: {
          Cookie: createCheckpointCookie({
            belongs_to_state: "no",
          }),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/estado-donde-vive");
  });

  it("redirects pre-contact visitors to the matching step before contact information", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn", {
        headers: {
          Cookie: createCheckpointCookie(preContactAnswers),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/buscando-oferta");
  });

  it("guards contact steps until the matching step has been seen", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/nombre", {
        headers: {
          Cookie: createCheckpointCookie(preContactAnswers),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/buscando-oferta");
  });

  it("keeps completed-but-not-seen matching visitors on the matching step", async () => {
    const handler = createFetchHandler();
    const resumeResponse = await handler(
      new Request("http://localhost/tn", {
        headers: {
          Cookie: createCheckpointCookie(completedMatchingAnswers),
        },
      }),
    );
    const contactResponse = await handler(
      new Request("http://localhost/tn/nombre", {
        headers: {
          Cookie: createCheckpointCookie(completedMatchingAnswers),
        },
      }),
    );
    const matchingResponse = await handler(
      new Request("http://localhost/tn/buscando-oferta", {
        headers: {
          Cookie: createCheckpointCookie(completedMatchingAnswers),
        },
      }),
    );

    expect(resumeResponse.status).toBe(302);
    expect(resumeResponse.headers.get("Location")).toBe("/tn/buscando-oferta");
    expect(contactResponse.status).toBe(302);
    expect(contactResponse.headers.get("Location")).toBe("/tn/buscando-oferta");
    expect(matchingResponse.status).toBe(200);
    const matchingHtml = await matchingResponse.text();
    expect(matchingHtml).toContain('"matching_offer":"completed"');
    expect((matchingHtml.match(/<p class="step-count" data-step-count/g) ?? []).length).toBe(1);
    expect(matchingHtml).toContain('<div class="progress-meta">');
    expect(matchingHtml).toContain('<p class="step-count" data-step-count aria-hidden="true">Paso 5 de 8</p>');
    expect(matchingHtml).toContain('class="matching-benefit is-success is-visible"');
    expect(matchingHtml).toContain(
      '<span class="matching-success-line">Encontramos agentes listos para cotizarle.</span>',
    );
    expect(matchingHtml).toContain('<span class="matching-success-line">Descubra cuánto puede ahorrar.</span>');
  });

  it("excludes matching from step count on the out-of-state path", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/buscando-oferta", {
        headers: {
          Cookie: createCheckpointCookie(completedOutOfStateMatchingAnswers),
        },
      }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('"matching_offer":"completed"');
    expect((html.match(/<p class="step-count" data-step-count/g) ?? []).length).toBe(1);
    expect(html).toContain('<p class="step-count" data-step-count aria-hidden="true">Paso 6 de 9</p>');
  });

  it("allows contact steps after the matching checkpoint has been seen", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/nombre", {
        headers: {
          Cookie: createCheckpointCookie(seenMatchingAnswers),
        },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-step="7" data-step-kind="text" data-step-counted="true" aria-hidden="false"');
    expect((html.match(/<p class="step-count" data-step-count/g) ?? []).length).toBe(1);
    expect(html).toContain('<p class="step-count" data-step-count>Paso 6 de 8</p>');
  });

  it("redirects an already-seen matching step to the next contact step", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/buscando-oferta", {
        headers: {
          Cookie: createCheckpointCookie(seenMatchingAnswers),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/nombre");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves checkpoint-dependent form pages without browser caching", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/buscando-oferta", {
        headers: {
          Cookie: createCheckpointCookie(completedMatchingAnswers),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("sanitizes invalid checkpoint cookie answers before resuming", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn", {
        headers: {
          Cookie: createCheckpointCookie({
            belongs_to_state: "maybe",
          }),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/vive-en-tennessee");
  });

  it("guards valid but too-forward step URLs", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/tiene-licencia"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/vive-en-tennessee");
  });

  it("guards the matching step until prior questions are answered", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/buscando-oferta"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/vive-en-tennessee");
  });

  it("guards the residence-state step until Tennessee has been answered no", async () => {
    const handler = createFetchHandler();
    const noCookie = await handler(new Request("http://localhost/tn/estado-donde-vive"));
    const yesCookie = await handler(
      new Request("http://localhost/tn/estado-donde-vive", {
        headers: {
          Cookie: createCheckpointCookie({ belongs_to_state: "yes" }),
        },
      }),
    );
    const noWithoutResidence = await handler(
      new Request("http://localhost/tn/tiene-licencia", {
        headers: {
          Cookie: createCheckpointCookie({ belongs_to_state: "no" }),
        },
      }),
    );

    expect(noCookie.status).toBe(302);
    expect(noCookie.headers.get("Location")).toBe("/tn/vive-en-tennessee");
    expect(yesCookie.status).toBe(302);
    expect(yesCookie.headers.get("Location")).toBe("/tn/tiene-licencia");
    expect(noWithoutResidence.status).toBe(302);
    expect(noWithoutResidence.headers.get("Location")).toBe("/tn/estado-donde-vive");
  });

  it("redirects legacy English step slugs to Spanish step URLs", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/belongs-to-state"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/vive-en-tennessee");
  });

  it("guards too-forward legacy English step slugs", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/has-license"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/vive-en-tennessee");
  });

  it("redirects unknown step slugs under valid states back to the state root", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/not-real"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn");
  });

  it("redirects deeper unknown paths under valid states back to the state root", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/not-real/extra"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn");
  });

  it("serves the cached WebP logo asset", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/assets/logo.webp"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("serves a no-store matching preview route without the full form flow", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/__preview/tn/buscando-oferta"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(html).toContain('"previewMode":true');
    expect(html).toContain('"url":"/__preview/tn/buscando-oferta"');
    expect(html).toContain(".matching-status:empty");
    expect(html).toContain('data-matching-status></p>');
    expect(html).toContain("Encontramos agentes listos para cotizarle.");
    expect(html).toContain("Descubra cuánto puede ahorrar.");
    expect(html).toContain('data-step="0" data-step-kind="interstitial" data-step-counted="false" aria-hidden="false"');
    expect(html).not.toContain("¿Usted vive en Tennessee?");
    expect(html).not.toContain('"slug":"nombre"');
  });

  it("returns an unavailable page for unsupported state codes", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/ga"));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("no está disponible");
  });

  it("sets a checkpoint cookie for valid partial answers", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "belongs_to_state", answer: "yes" }),
      }),
    );
    const body = await response.json();
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, nextUrl: "/tn/tiene-licencia" });
    expect(setCookie).toContain(`${getCheckpointCookieName("tn")}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=604800");
  });

  it("routes completed pre-contact answers through the matching checkpoint", async () => {
    const handler = createFetchHandler();
    const carsResponse = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie({
            belongs_to_state: "yes",
            has_license: "yes",
            has_insurance: "no",
            is_clean_title: "yes",
          }),
        },
        body: JSON.stringify({ questionKey: "number_of_registered_cars", answer: "1" }),
      }),
    );
    const carsBody = await carsResponse.json();
    const cookie = carsResponse.headers.get("Set-Cookie")?.split(";")[0] ?? "";
    const completedResponse = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ questionKey: "matching_offer", answer: "completed" }),
      }),
    );
    const completedBody = await completedResponse.json();
    const completedCookie = completedResponse.headers.get("Set-Cookie")?.split(";")[0] ?? "";
    const matchingResponse = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: completedCookie,
        },
        body: JSON.stringify({ questionKey: "matching_offer", answer: "seen" }),
      }),
    );
    const matchingBody = await matchingResponse.json();

    expect(carsResponse.status).toBe(200);
    expect(carsBody).toMatchObject({ ok: true, nextUrl: "/tn/buscando-oferta" });
    expect(completedResponse.status).toBe(200);
    expect(completedBody).toMatchObject({
      ok: true,
      nextUrl: "/tn/buscando-oferta",
      answers: completedMatchingAnswers,
    });
    expect(matchingResponse.status).toBe(200);
    expect(matchingBody).toMatchObject({
      ok: true,
      nextUrl: "/tn/nombre",
      answers: seenMatchingAnswers,
    });
  });

  it("skips the matching route from previous-step checkpoints after it has been seen", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie({
            belongs_to_state: "yes",
            has_license: "yes",
            has_insurance: "no",
            is_clean_title: "yes",
            matching_offer: "seen",
          }),
        },
        body: JSON.stringify({ questionKey: "number_of_registered_cars", answer: "1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, nextUrl: "/tn/nombre" });
  });

  it("routes no Tennessee answers through the residence-state checkpoint", async () => {
    const handler = createFetchHandler();
    const noResponse = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "belongs_to_state", answer: "no" }),
      }),
    );
    const noBody = await noResponse.json();
    const cookie = noResponse.headers.get("Set-Cookie")?.split(";")[0] ?? "";
    const stateResponse = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ questionKey: "residence_state", answer: "Texas" }),
      }),
    );
    const stateBody = await stateResponse.json();

    expect(noResponse.status).toBe(200);
    expect(noBody).toMatchObject({ ok: true, nextUrl: "/tn/estado-donde-vive" });
    expect(stateResponse.status).toBe(200);
    expect(stateBody).toMatchObject({
      ok: true,
      nextUrl: "/tn/tiene-licencia",
      answers: {
        belongs_to_state: "no",
        residence_state: "TX",
      },
    });
  });

  it("marks checkpoint cookies secure when served over HTTPS", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("https://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "belongs_to_state", answer: "yes" }),
      }),
    );

    expect(response.headers.get("Set-Cookie")).toContain("Secure");
  });

  it("rejects invalid checkpoint answers", async () => {
    const handler = createFetchHandler();
    const invalidChoice = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "belongs_to_state", answer: "maybe" }),
      }),
    );
    const invalidPhone = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "phone_number", answer: "+52 55 1234 5678" }),
      }),
    );
    const invalidState = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie({ belongs_to_state: "no" }),
        },
        body: JSON.stringify({ questionKey: "residence_state", answer: "Not a state" }),
      }),
    );
    const hiddenState = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "residence_state", answer: "Texas" }),
      }),
    );
    const invalidMatching = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie(preContactAnswers),
        },
        body: JSON.stringify({ questionKey: "matching_offer", answer: "nope" }),
      }),
    );
    const prematureSeenMatching = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie(preContactAnswers),
        },
        body: JSON.stringify({ questionKey: "matching_offer", answer: "seen" }),
      }),
    );
    const tooEarlyMatching = await handler(
      new Request("http://localhost/api/forms/tn/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "matching_offer", answer: "seen" }),
      }),
    );

    expect(invalidChoice.status).toBe(400);
    await expect(invalidChoice.text()).resolves.toContain("Answer is not a valid option.");
    expect(invalidPhone.status).toBe(400);
    await expect(invalidPhone.text()).resolves.toContain("Ingrese un número de teléfono válido de Estados Unidos.");
    expect(invalidState.status).toBe(400);
    await expect(invalidState.text()).resolves.toContain("Ingrese un estado válido de Estados Unidos.");
    expect(hiddenState.status).toBe(400);
    await expect(hiddenState.text()).resolves.toContain("Question is not available yet.");
    expect(invalidMatching.status).toBe(400);
    await expect(invalidMatching.text()).resolves.toContain("No pudimos completar este paso.");
    expect(prematureSeenMatching.status).toBe(400);
    await expect(prematureSeenMatching.text()).resolves.toContain("Question is not complete yet.");
    expect(tooEarlyMatching.status).toBe(400);
    await expect(tooEarlyMatching.text()).resolves.toContain("Question is not available yet.");
  });

  it("prefills rendered fields from sanitized checkpoint cookies", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/nombre", {
        headers: {
          Cookie: createCheckpointCookie({
            ...seenMatchingAnswers,
            first_name: "Ana",
          }),
        },
      }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('value="yes" checked');
    expect(html).toContain('value="Ana"');
    expect(html).toContain('data-step="7" data-step-kind="text" data-step-counted="true" aria-hidden="false"');
  });

  it("accepts valid local submissions and logs the payload", async () => {
    const loggedPayloads: unknown[] = [];
    const handler = createFetchHandler({ logger: (payload) => loggedPayloads.push(payload) });
    const response = await handler(
      new Request("http://localhost/api/forms/tn/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: { ...validAnswers, matching_offer: "seen" } }),
      }),
    );

    expect(response.status).toBe(201);
    expect(loggedPayloads).toHaveLength(1);
    expect(loggedPayloads[0]).toMatchObject({
      stateCode: "tn",
      formId: "1011189481863371",
      pageName: "Seguros Aseguranza",
    });
    expect((loggedPayloads[0] as { answers?: Record<string, string> }).answers?.matching_offer).toBeUndefined();
  });

  it("clears the checkpoint cookie after a successful final submission", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie({ belongs_to_state: "yes" }),
        },
        body: JSON.stringify({ answers: validAnswers }),
      }),
    );
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(201);
    expect(setCookie).toContain(`${getCheckpointCookieName("tn")}=`);
    expect(setCookie).toContain("Max-Age=0");
  });
});

describe("form rendering", () => {
  it("renders the logo and brand theme tokens", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain('src="/assets/logo.webp"');
    expect(html).not.toContain("Seguro para Latinos en Tennessee");
    expect(html).toContain("--brand-navy: #073b8e");
    expect(html).toContain("--brand-blue: #064df6");
    expect(html).toContain("--brand-pink: #f80057");
    expect(html).toContain("background: var(--accent)");
  });

  it("uses larger desktop controls while preserving mobile sizing rules", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain("max-width: 100%;");
    expect(html).toContain("font-size: clamp(2rem, 4vw, 2.75rem);");
    expect(html).toContain("text-wrap: balance;");
    expect(html).toContain("#steps {\n        min-height: 0;");
    expect(html).toContain('<div class="progress-meta">');
    expect(html).toContain(".progress-area {\n        position: relative;");
    expect(html).toContain("position: absolute;\n        right: 0;\n        bottom: calc(100% + 6px);");
    expect(html).not.toContain(".progress-area {\n        display: grid;");
    expect((html.match(/<p class="step-count" data-step-count/g) ?? []).length).toBe(1);
    expect(html).toContain('const stepCount = document.querySelector("[data-step-count]");');
    expect(html).toContain('stepCount.setAttribute("aria-hidden", String(!question.countsAsStep));');
    expect(html).toContain('.step-count[aria-hidden="true"]');
    expect(html).toContain("visibility: hidden;");
    expect(html).toContain('#steps:has(.step[data-step-kind="interstitial"][aria-hidden="false"])');
    expect(html).toContain('.step[data-step-kind="interstitial"][aria-hidden="false"]');
    expect(html).toContain("grid-template-rows: auto minmax(0, 1fr);");
    expect(html).toContain("height: 100%;");
    expect(html).toContain("align-content: center;");
    expect(html).toContain("justify-content: center;");
    expect(html).toContain("width: min(100%, 620px);");
    expect(html).toContain("justify-self: center;");
    expect(html).toContain("@media (min-width: 561px)");
    expect(html).toContain("height: 724px;");
    expect(html).toContain('.step[data-step-kind="interstitial"] .matching-content');
    expect(html).not.toContain(".matching-content {\n          height: 156px;");
    expect(html).toContain("min-height: 78px;");
    expect(html).toContain("min-height: 70px;");
    expect(html).toContain("min-width: 190px;");
    expect(html).toContain("font-size: 1.4rem;");
    expect(html).toContain("@media (max-width: 560px)");
    expect(html).toContain("position: fixed;");
    expect(html).toContain("overflow: hidden;");
    expect(html).toContain("overscroll-behavior: none;");
    expect(html).toContain("background: var(--surface);");
    expect(html).toContain("height: 100dvh;");
    expect(html).toContain("calc(40px + env(safe-area-inset-top)) 24px calc(32px + env(safe-area-inset-bottom))");
    expect(html).toContain('.form-panel:has(.step[aria-hidden="false"][data-step-kind="text"] .text-input:focus)');
    expect(html).not.toContain('.form-panel:has(.step[aria-hidden="false"][data-step-kind="text"] .text-input) {');
    expect(html).not.toContain('.form-panel:has(.step[aria-hidden="false"] .text-input)');
    expect(html).toContain("grid-template-rows: auto auto auto auto;");
    expect(html).toContain("align-content: start;");
    expect(html).not.toContain('id="form-error"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain(".error {\n");
    expect(html).not.toContain(".error:empty");
    expect(html).not.toContain(".form-panel:has(.text-input:focus)");
    expect(html).not.toContain(".form-panel:has(.text-input:focus) footer");
    expect(html).not.toContain("transform: translateY(clamp(-160px, -18dvh, -96px));");
    expect(html).not.toContain(".shell:has(.text-input:focus)");
    expect(html).toContain("flex-direction: column;");
    expect(html).toContain("min-height: 58px;");
    expect(html).toContain("font-size: 1.12rem;");
    expect(html).toContain("order: 1;");
    expect(html).toContain("order: 2;");
    expect(html).not.toContain("field.focus()");
  });

  it("wires choice answers to delayed auto-advance on click and number keys", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain("function advanceAfterChoiceSelection(answer)");
    expect(html).toContain("async function saveCheckpoint(questionKey, answer)");
    expect(html).toContain("/checkpoints");
    expect(html).toContain("function normalizeUsPhoneNumber(value)");
    expect(html).toContain('form.addEventListener("change"');
    expect(html).toContain("advanceAfterChoiceSelection(target.value)");
    expect(html).toContain("function getClickedChoiceInput(target)");
    expect(html).toContain("function advanceAfterChoiceClick(event)");
    expect(html).toContain('target.closest(".option")');
    expect(html).toContain("option.querySelector(\"input[type='radio']\")");
    expect(html).toContain("advanceAfterChoiceSelection(input.value)");
    expect(html).toContain("function selectChoiceByNumberKey(event)");
    expect(html).toContain("function isTypingTarget(value)");
    expect(html).toContain('document.addEventListener("keydown"');
    expect(html).toContain("selectChoiceByNumberKey(event)");
    expect(html).toContain("event.preventDefault()");
    expect(html).toContain("option.checked = true");
    expect(html).toContain("advanceAfterChoiceSelection(option.value)");
    expect(html).toContain("}, 180);");
  });

  it("renders the branded matching step with one-time auto-continue wiring", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain('"kind":"interstitial"');
    expect(html).toContain('"slug":"buscando-oferta"');
    expect(html).toContain('"url":"/tn/buscando-oferta"');
    expect(html).not.toContain("Buscando opciones para ti...");
    expect(html).toContain("Estamos buscando su seguro ideal");
    expect(html).toContain("Revisando sus respuestas");
    expect(html).toContain("Buscando agentes disponibles");
    expect(html).toContain("Priorizando atención en español");
    expect(html).toContain("Preparando opciones en {{stateName}}");
    expect(html).toContain("Encontramos agentes listos para cotizarle.");
    expect(html).toContain("Descubra cuánto puede ahorrar.");
    expect(html).toContain("Encontramos agentes listos para cotizarle.\\nDescubra cuánto puede ahorrar.");
    expect(html).toContain("function getCoverageStateName()");
    expect(html).toContain('answers.residence_state || config.stateCode');
    expect(html).toContain("function runMatchingStep()");
    expect(html).toContain("function showMatchingSuccess(question, elements, options = {})");
    expect(html).toContain('"countsAsStep":false');
    expect(html).toContain("function isCountedStep(question)");
    expect(html).toContain("return question.countsAsStep !== false");
    expect(html).toContain("function getCountedVisibleStepIndexes()");
    expect(html).toContain("function getCurrentCountedStepNumber()");
    expect(html).toContain("progressBar.style.width = (countedStepNumber / countedStepCount) * 100 + \"%\"");
    expect(html).toContain("let matchingTextTransitionId = 0;");
    expect(html).toContain("matchingTextTransitionId += 1;");
    expect(html).toContain("function applyMatchingBenefitText(elements, text, className)");
    expect(html).toContain("function fadeMatchingBenefitIn(elements, transitionId)");
    expect(html).toContain("function setMatchingBenefitText(elements, text, className, options = {})");
    expect(html).toContain('setMatchingBenefitText(elements, question.successLabel, "is-success", options)');
    expect(html).toContain("showMatchingSuccess(question, elements, { immediate: true })");
    expect(html).toContain('elements.benefit.classList.add(className)');
    expect(html).toContain("matchingBenefitFadeOutMs = 300");
    expect(html).toContain("matchingBenefitFadeInMs = 420");
    expect(html).toContain("matchingBenefitDisplayMs = 950");
    expect(html).toContain("matchingBenefitMinCount = 3");
    expect(html).toContain("matchingBenefitMaxCount = 4");
    expect(html).toContain("function shuffleMatchingBenefits(benefits)");
    expect(html).toContain("Math.floor(Math.random() * (index + 1))");
    expect(html).toContain("function getRandomMatchingBenefitCount(availableBenefitCount)");
    expect(html).toContain("Math.random() * (maxBenefitCount - minBenefitCount + 1)");
    expect(html).toContain("function getMatchingBenefitSequence(benefits)");
    expect(html).toContain("return shuffledBenefits.slice(0, getRandomMatchingBenefitCount(shuffledBenefits.length))");
    expect(html).toContain("function getMatchingBenefitTimeline(benefits)");
    expect(html).toContain("function getMatchingBenefitTimelineDuration(benefitTimeline)");
    expect(html).toContain("const benefitTimeline = getMatchingBenefitTimeline(question.benefits.map(formatMatchingBenefit))");
    expect(html).toContain("duration: matchingBenefitDisplayMs");
    expect(html).toContain("startsAt += matchingBenefitDisplayMs");
    expect(html).toContain("benefitTiming.startsAt");
    expect(html).toContain("const successDelay = getMatchingBenefitTimelineDuration(benefitTimeline) || matchingBenefitDisplayMs");
    expect(html).toContain("is-fading-out");
    expect(html).toContain("is-fading-in");
    expect(html).toContain("is-visible");
    expect(html).toContain(".matching-benefit.is-success");
    expect(html).toContain("font-size: clamp(1.35rem, 3vw, 1.65rem)");
    expect(html).toContain("line-height: 1.18");
    expect(html).toContain("-webkit-text-stroke: 0.025em rgba(255, 253, 244, 0.9)");
    expect(html).toContain("paint-order: stroke fill");
    expect(html).toContain("white-space: pre-line");
    expect(html).toContain(".matching-success-line");
    expect(html).toContain(".matching-success-line:first-child");
    expect(html).toContain("color: var(--brand-navy)");
    expect(html).toContain(".matching-success-line:last-child");
    expect(html).toContain("color: var(--accent)");
    expect(html).toContain("0 0.025em 0 rgba(255, 253, 244, 0.74)");
    expect(html).toContain("0 0.1em 0.22em rgba(7, 59, 142, 0.14)");
    expect(html).toContain("filter: drop-shadow(0 12px 24px rgba(7, 59, 142, 0.1))");
    expect(html).not.toContain("0 14px 32px rgba(248, 0, 87, 0.16)");
    expect(html).toContain("matching-benefit-fade-out 300ms ease forwards");
    expect(html).toContain("matching-benefit-fade-in 420ms ease forwards");
    expect(html).toContain("@keyframes matching-benefit-fade-out");
    expect(html).toContain("@keyframes matching-benefit-fade-in");
    expect(html).toContain("scheduleMatchingTimer(() =>");
    expect(html).toContain("if (transitionId !== matchingTextTransitionId)");
    expect(html).toContain("applyMatchingBenefitText(elements, text, className)");
    expect(html).toContain("function renderMatchingBenefitContent(element, text, className)");
    expect(html).toContain("element.replaceChildren()");
    expect(html).toContain('if (className !== "is-success")');
    expect(html).toContain('text.split("\\n").filter((line) => line.trim())');
    expect(html).toContain('lineElement.className = "matching-success-line"');
    expect(html).toContain("setMatchingBenefitText(elements, benefitTimeline[0]?.text ?? \"\", \"\", { initial: true })");
    expect(html).not.toContain("onTextShown");
    expect(html).not.toContain("getContext");
    expect(html).not.toContain("cancelAnimationFrame");
    expect(html).not.toContain("HTMLCanvasElement");
    expect(html).not.toContain("drawCanvas");
    expect(html).not.toContain("drawRoundedCanvasRect");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("is-matching-success");
    expect(html).toContain('elements.status.textContent = ""');
    expect(html).toContain('question.kind === "interstitial" && answers[question.key] === question.seenAnswer');
    expect(html).toContain("function shouldHideMatchingStep(question)");
    expect(html).toContain("function replaceHiddenMatchingRouteIfNeeded()");
    expect(html).toContain("function getNextVisibleStepIndexAfter(stepIndex)");
    expect(html).toContain('window.addEventListener("pageshow"');
    expect(html).toContain("event.persisted");
    expect(html).toContain("window.location.reload()");
    expect(html).toContain("function isStepAnswered(question)");
    expect(html).toContain("const completedMatchingSteps = new Set();");
    expect(html).toContain("function completeMatchingStep(question, runId)");
    expect(html).toContain("function replaceToUrl(url)");
    expect(html).toContain("completedMatchingSteps.add(question.key)");
    expect(html).toContain("!completedMatchingSteps.has(question.key)");
    expect(html).toContain('saveCheckpoint(question.key, question.completionAnswer)');
    expect(html).toContain('saveCheckpoint(question.key, question.seenAnswer)');
    expect(html).toContain("replaceToUrl(nextUrl ?? config.questions[getNextVisibleStepIndex()].url)");
    expect(html).toContain('nextButton.textContent = "Siguiente"');
    expect(html).not.toContain("matching-loader");
    expect(html).not.toContain("data-matching-retry");
    expect(html).not.toContain('.form-panel[data-active-kind="interstitial"] footer');
    expect(html).toContain("overflow: visible");
  });

  it("wires a forgiving US phone mask without blocking browser autofill", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain("font-weight: 400;");
    expect(html).toContain("padding: 6px 0 6px;");
    expect(html).toContain(".text-input::placeholder");
    expect(html).toContain('placeholder="Escriba su nombre aquí"');
    expect(html).toContain('placeholder="Escriba su apellido aquí"');
    expect(html).toContain('placeholder="Escriba su telefono aquí"');
    expect(html).toContain('form.addEventListener("input"');
    expect(html).toContain('form.addEventListener("beforeinput"');
    expect(html).toContain("function parseUsPhoneInput(value)");
    expect(html).toContain("function formatUsPhoneForDisplay(value)");
    expect(html).toContain("function isUnsupportedInternationalPhone(value)");
    expect(html).toContain("function shouldBlockExtraPhoneInput(event)");
    expect(html).toContain('const prefix = hasPlusUsPrefix ? "+1" : hasPlainUsPrefix ? "1" : "";');
    expect(html).toContain('parsedPhone.prefix + " " + formattedNationalPhone');
    expect(html).toContain("parsedPhone.nationalDigits.length < 10");
    expect(html).toContain('type="tel"');
    expect(html).toContain('autocomplete="tel"');
    expect(html).not.toContain("maxlength=");
    expect(html).not.toContain("pattern=");
  });

  it("renders a lightweight error modal instead of inline form errors", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).not.toContain('id="form-error"');
    expect(html).not.toContain('<p class="error"');
    expect(html).not.toContain(".error {\n");
    expect(html).toContain('class="error-modal"');
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="error-modal-message"');
    expect(html).toContain('id="error-modal-close"');
    expect(html).toContain("Revise esta respuesta");
    expect(html).toContain("Entendido");
    expect(html).toContain("function showErrorModal(message, options = {})");
    expect(html).toContain("function hideErrorModal()");
    expect(html).toContain('errorModalClose.addEventListener("click"');
    expect(html).toContain("event.target === errorModal");
    expect(html).toContain('event.key === "Escape"');
    expect(html).toContain('showErrorModal("Esta respuesta es requerida."');
    expect(html).toContain("showErrorModal(submitErrorMessage)");
    expect(html).toContain('checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar esta respuesta."');
  });

  it("synthetically submits focused text fields on mobile blur", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain("function isMobileViewport()");
    expect(html).toContain('window.matchMedia("(max-width: 560px)").matches');
    expect(html).toContain("function shouldSubmitTextInputOnMobileBlur(event)");
    expect(html).toContain("function shouldSubmitTextInputOnMobileOutsidePointer(event)");
    expect(html).toContain("function validateCurrentStep(options = {})");
    expect(html).toContain("const shouldFocusInvalid = options.focusInvalid !== false;");
    expect(html).toContain("async function handleNext(options = {})");
    expect(html).toContain("const shouldFocusInvalid = options.focusInvalid ?? !isMobileViewport();");
    expect(html).toContain("validateCurrentStep({ focusInvalid: shouldFocusInvalid })");
    expect(html).toContain("void handleNext({ focusInvalid: false });");
    expect(html).toContain("function getCurrentTextInput()");
    expect(html).toContain("function getValidationErrorReturnFocusTarget(shouldFocusInvalid)");
    expect(html).toContain("returnFocusTarget: getValidationErrorReturnFocusTarget(shouldFocusInvalid)");
    expect(html).toContain("let focusedTextInput");
    expect(html).toContain('form.addEventListener("focusin"');
    expect(html).toContain('form.addEventListener("focusout"');
    expect(html).toContain('document.addEventListener("pointerdown"');
    expect(html).not.toContain("if (shouldSubmitTextInputOnMobileBlur(event)) {\n            nextButton.click();");
    expect(html).toContain("isActionPointerDown");
    expect(html).toContain('actions.addEventListener("pointerdown"');
  });

  it("includes step URLs and browser history handling", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain('"activeStepIndex":0');
    expect(html).toContain('"initialAnswers":{}');
    expect(html).toContain('"slug":"vive-en-tennessee"');
    expect(html).toContain('"slug":"estado-donde-vive"');
    expect(html).toContain('"slug":"buscando-oferta"');
    expect(html).toContain('"url":"/tn/vive-en-tennessee"');
    expect(html).toContain('"url":"/tn/estado-donde-vive"');
    expect(html).toContain('"url":"/tn/buscando-oferta"');
    expect(html).toContain('"showWhen":{"questionKey":"belongs_to_state","answer":"no"}');
    expect(html).toContain("window.history.pushState");
    expect(html).toContain("window.history.replaceState");
    expect(html).toContain('window.addEventListener("popstate"');
    expect(html).toContain("getStepIndexForPath(window.location.pathname)");
    expect(html).toContain("currentQuestion.url !== window.location.pathname");
  });

  it("renders the requested active step and saved answers", () => {
    const html = renderFormPage(getRequiredTennesseeForm(), {
      activeStepIndex: 1,
      answers: { belongs_to_state: "yes" },
    });

    expect(html).toContain('data-step="0" data-step-kind="choice" data-step-counted="true" aria-hidden="true"');
    expect(html).toContain('data-step="1" data-step-kind="state" data-step-counted="true" aria-hidden="false"');
    expect(html).toContain('value="yes" checked');
    expect(html).toContain('"initialAnswers":{"belongs_to_state":"yes"}');
  });

  it("renders the mobile-friendly state autocomplete wiring", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain('data-state-input="true"');
    expect(html).toContain('placeholder="Escriba su estado aquí"');
    expect(html).toContain("data-state-suggestions");
    expect(html).toContain("function normalizeUsState(value)");
    expect(html).toContain("class=\"state-suggestions-shell\"");
    expect(html).toContain("data-state-suggestions-shell");
    expect(html).toContain('"suggestionSource":"us_states"');
    expect(html).toContain('"autocompleteSources"');
    expect(html).toContain('"washington d c"');
    expect(html).toContain("function getAutocompleteConfig(question)");
    expect(html).toContain("function getAutocompleteSuggestions(value, autocompleteConfig)");
    expect(html).toContain("function getAutocompleteMatchScore(item, autocompleteConfig, normalizedQuery)");
    expect(html).toContain("Number.POSITIVE_INFINITY");
    expect(html).toContain("autocompleteConfig.getLabel(left.item).localeCompare(autocompleteConfig.getLabel(right.item))");
    expect(html).not.toContain(".slice(0, 3);");
    expect(html).toContain("height: 220px;");
    expect(html).toContain("height: 180px;");
    expect(html).toContain("overflow-y: auto;");
    expect(html).toContain("overscroll-behavior: contain;");
    expect(html).toContain("state-scroll-fade-top");
    expect(html).toContain("state-scroll-fade-bottom");
    expect(html).toContain("function updateStateSuggestionScrollHints(suggestions)");
    expect(html).toContain("window.requestAnimationFrame(() =>");
    expect(html).toContain("data-can-scroll-up");
    expect(html).toContain("data-can-scroll-down");
    expect(html).toContain('target.matches("[data-state-suggestions]")');
    expect(html).toContain("function updateStateSuggestions(input)");
    expect(html).toContain("isStateSuggestionPointerDown");
    expect(html).toContain('target.closest("[data-state-suggestions-shell]")');
    expect(html).toContain("Ingrese un estado válido de Estados Unidos.");
  });
});

function getRequiredTennesseeForm() {
  const form = getFormByStateCode("tn");

  if (!form) {
    throw new Error("Expected Tennessee form to exist.");
  }

  return form;
}

function createCheckpointCookie(answers: Record<string, string>): string {
  return `${getCheckpointCookieName("tn")}=${encodeCheckpointAnswers(answers)}`;
}
