import { describe, expect, it } from "bun:test";
import { getFormByStateCode } from "../src/forms";
import { renderFormPage } from "../src/render";
import { createFetchHandler } from "../src/server";
import { validateSubmission } from "../src/validation";

const validAnswers = {
  belongs_to_state: "yes",
  has_license: "yes",
  has_insurance: "no",
  is_clean_title: "yes",
  number_of_registered_cars: "1",
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

  it("rejects phone numbers that do not normalize to exactly 10 digits", () => {
    const result = validateSubmission(form, { answers: { ...validAnswers, phone_number: "615-555" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "phone_number",
        message: "Phone number must contain exactly 10 digits.",
      });
    }
  });

  it("accepts formatted US phone numbers and normalizes them", () => {
    const result = validateSubmission(form, { answers: validAnswers }, "2026-05-13T00:00:00.000Z");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.answers.phone_number).toBe("6155551234");
      expect(result.payload.stateCode).toBe("tn");
      expect(result.payload.formId).toBe("1011189481863371");
    }
  });
});

describe("server routing", () => {
  it("returns an unavailable page for unsupported state codes", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/ga"));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("no está disponible");
  });

  it("accepts valid local submissions and logs the payload", async () => {
    const loggedPayloads: unknown[] = [];
    const handler = createFetchHandler({ logger: (payload) => loggedPayloads.push(payload) });
    const response = await handler(
      new Request("http://localhost/api/forms/tn/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: validAnswers }),
      }),
    );

    expect(response.status).toBe(201);
    expect(loggedPayloads).toHaveLength(1);
    expect(loggedPayloads[0]).toMatchObject({
      stateCode: "tn",
      formId: "1011189481863371",
      pageName: "Seguros Aseguranza",
    });
  });
});

describe("form rendering", () => {
  it("wires choice answers to delayed auto-advance on click and number keys", () => {
    const html = renderFormPage(getRequiredTennesseeForm());

    expect(html).toContain("function advanceAfterChoiceSelection(answer)");
    expect(html).toContain('form.addEventListener("change"');
    expect(html).toContain("advanceAfterChoiceSelection(target.value)");
    expect(html).toContain("advanceAfterChoiceSelection(option.value)");
    expect(html).toContain("}, 180);");
  });
});

function getRequiredTennesseeForm() {
  const form = getFormByStateCode("tn");

  if (!form) {
    throw new Error("Expected Tennessee form to exist.");
  }

  return form;
}
