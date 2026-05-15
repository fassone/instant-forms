import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { selectedScripts } from "../../src/authoring/scripts/registry";
import { formRoutes } from "../../src/authoring/routes/registry";
import { createFetchHandler } from "../../src/platform/app/server";
import { registerScriptRoutes } from "../../src/platform/app/routes/scripts";
import { autocompleteSource, defineFormFlow, getStepSlug, isCountedStep, step } from "../../src/platform/flow";
import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";
import { FORM_CONFIG_PLACEHOLDER_EXPRESSION, buildTransitionAsset, renderFormPage } from "../../src/platform/rendering";
import { buildInlineCss, getInlineAssetMode } from "../../src/platform/rendering/inline-assets";
import {
  defineFormRoutes,
  getFormRouteByRouteKey,
  redirectTo,
  registerFormRoutePages,
  unavailable,
} from "../../src/platform/routing";
import { buildScriptProxyUpstreamUrl, proxySelectedScript } from "../../src/platform/scripts";
import { createStateAutocompleteItems, rankAutocompleteItems } from "../../src/platform/steps/autocomplete/ranking";
import { normalizeUsPhoneNumber } from "../../src/platform/steps/phone/us-phone";
import { validateSubmission } from "../../src/platform/submissions/validation";
import { US_STATES, normalizeUsState } from "../../src/shared/data/us-states";

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

const preConsentAnswers = {
  ...seenMatchingAnswers,
  first_name: "Ana",
  last_name: "Lopez",
  phone_number: "(615) 555-1234",
};

const validAnswers = {
  ...preConsentAnswers,
  trustedform_consent: "accepted",
};

const trustedFormCertUrl = "https://cert.trustedform.com/454a35b802f3e7b63ffabb4efedb7c6ebe67886c";
const routeKey = "tn_custom";

const unavailableContent = {
  title: "404",
  message: "Esta página no existe o ya no está disponible.",
  cta: {
    label: "Ir al formulario",
    href: "/tn/custom",
  },
};

const repoRoot = join(import.meta.dir, "../..");

describe("form registry", () => {
  it("resolves the Tennessee form by route-derived key", () => {
    const routeEntry = getRequiredTennesseeRoute();

    expect(routeEntry.routeKey).toBe(routeKey);
    expect(routeEntry.routeSegments).toEqual(["tn", "custom"]);
    expect(routeEntry.form.customVariables).toMatchObject({
      areaCode: "TN",
      areaName: "Tennessee",
    });
    expect(routeEntry.form.page.name).toBe("Seguros Aseguranza");
  });

  it("maps the public Tennessee route folder to the Tennessee flow", () => {
    const form = getRequiredTennesseeForm();
    const tnNode = formRoutes.folders.tn;

    expect(formRoutes.index).toEqual({ type: "redirect", to: "/tn" });
    expect(tnNode?.type).toBe("group");
    if (tnNode?.type === "group") {
      expect(tnNode.notFound).toEqual({ type: "redirect", to: "/tn/custom" });
      expect(tnNode.children.custom).toEqual({ type: "flow", form });
    }
    expect(formRoutes.notFound).toEqual({ type: "unavailable", ...unavailableContent, status: 404 });
  });

  it("reserves the preview folder for platform-generated mirrors", () => {
    const form = getRequiredTennesseeForm();

    expect(() =>
      defineFormRoutes({
        index: redirectTo("/tn"),
        folders: {
          __preview: form,
        },
        notFound: unavailable(unavailableContent),
      }),
    ).toThrow("__preview");
  });

  it("rejects invalid route-group definitions", () => {
    const form = getRequiredTennesseeForm();

    expect(() =>
      defineFormRoutes({
        index: redirectTo("/tn"),
        folders: {
          Bad_Segment: form,
        },
        notFound: unavailable(unavailableContent),
      }),
    ).toThrow("lowercase static URL segment");

    expect(() =>
      defineFormRoutes({
        index: redirectTo("/tn"),
        folders: {
          tn: {
            notFound: form as never,
          },
        },
        notFound: unavailable(unavailableContent),
      }),
    ).toThrow('route action for "notFound"');
  });

  it("uses the authored folder name for public form rendering", async () => {
    const form = getRequiredTennesseeForm();
    const app = new Hono();
    registerFormRoutePages(
      app,
      defineFormRoutes({
        index: redirectTo("/cotiza"),
        folders: {
          cotiza: form,
        },
        notFound: unavailable(unavailableContent),
      }),
    );

    const folderResponse = await app.fetch(new Request("http://localhost/cotiza"));
    const stepResponse = await app.fetch(new Request("http://localhost/cotiza/vive-en-tennessee"));
    const unknownChildResponse = await app.fetch(new Request("http://localhost/cotiza/no-existe"));
    const html = await stepResponse.text();

    expect(folderResponse.headers.get("Location")).toBe("/cotiza/vive-en-tennessee");
    expect(stepResponse.status).toBe(200);
    expect(html).toContain('"url":"/cotiza/vive-en-tennessee"');
    expect(html).toContain('"tiene-licencia":"/cotiza/tiene-licencia"');
    expect(unknownChildResponse.headers.get("Location")).toBe("/cotiza");
  });

  it("supports nested public form route groups", async () => {
    const form = getRequiredTennesseeForm();
    const app = new Hono();
    registerFormRoutePages(
      app,
      defineFormRoutes({
        index: redirectTo("/tn"),
        folders: {
          tn: {
            custom: form,
            notFound: redirectTo("/tn/custom"),
          },
        },
        notFound: unavailable(unavailableContent),
      }),
    );

    const groupResponse = await app.fetch(new Request("http://localhost/tn"));
    const folderResponse = await app.fetch(new Request("http://localhost/tn/custom"));
    const stepResponse = await app.fetch(new Request("http://localhost/tn/custom/vive-en-tennessee"));
    const unknownChildResponse = await app.fetch(new Request("http://localhost/tn/not-real"));
    const previewGroupResponse = await app.fetch(new Request("http://localhost/__preview/tn"));
    const previewResponse = await app.fetch(new Request("http://localhost/__preview/tn/custom/buscando-oferta"));
    const html = await stepResponse.text();
    const previewHtml = await previewResponse.text();

    expect(groupResponse.headers.get("Location")).toBe("/tn/custom");
    expect(folderResponse.headers.get("Location")).toBe("/tn/custom/vive-en-tennessee");
    expect(stepResponse.status).toBe(200);
    expect(html).toContain('"url":"/tn/custom/vive-en-tennessee"');
    expect(unknownChildResponse.headers.get("Location")).toBe("/tn/custom");
    expect(previewGroupResponse.headers.get("Location")).toBe("/__preview/tn/custom");
    expect(previewResponse.status).toBe(200);
    expect(previewHtml).toContain('"url":"/__preview/tn/custom/buscando-oferta"');
  });

  it("lets route groups inherit the nearest fallback", async () => {
    const form = getRequiredTennesseeForm();
    const app = new Hono();
    registerFormRoutePages(
      app,
      defineFormRoutes({
        index: redirectTo("/tn"),
        folders: {
          tn: {
            custom: form,
          },
        },
        notFound: unavailable(unavailableContent),
      }),
    );

    const response = await app.fetch(new Request("http://localhost/tn"));
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain("404");
    expect(html).toContain("Esta página no existe o ya no está disponible.");
    expect(html).toContain('href="/tn/custom"');
  });

  it("keeps contact and consent fields at the end of the flow", () => {
    const form = getRequiredTennesseeForm();

    expect(form.steps.map((stepDefinition) => stepDefinition.key).slice(-4)).toEqual([
      "first_name",
      "last_name",
      "phone_number",
      "trustedform_consent",
    ]);
  });

  it("uses Spanish slugs for public step URLs", () => {
    const form = getRequiredTennesseeForm();

    expect(form.steps.map((question) => getStepSlug(question))).toEqual([
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
      "consentimiento",
    ]);
  });

  it("uses reusable counted-step semantics", () => {
    const form = getRequiredTennesseeForm();
    const firstQuestion = form.steps[0];
    const matchingQuestion = form.steps.find((question) => question.kind === "interstitial");

    expect(firstQuestion ? isCountedStep(firstQuestion) : undefined).toBe(true);
    expect(matchingQuestion ? isCountedStep(matchingQuestion) : undefined).toBe(false);
    expect(firstQuestion ? isCountedStep({ ...firstQuestion, countsAsStep: false }) : undefined).toBe(false);
    expect(matchingQuestion ? isCountedStep({ ...matchingQuestion, countsAsStep: true }) : undefined).toBe(true);
  });

  it("compiles declarative DSL steps with templates, behaviors, and success colors", () => {
    const flow = defineFormFlow({
      name: "Test Flow",
      status: "ACTIVE",
      customVariables: {
        areaCode: "XX",
        areaName: "Example Area",
      },
      page: { name: "Test Page" },
      steps: [
        step.choice({
          key: "choice_key",
          slug: "elige",
          label: "Elige",
          options: [{ key: "yes", label: "Si" }],
        }),
        step.text({
          key: "first_name",
          slug: "nombre",
          label: "Nombre",
          autocomplete: "given-name",
        }),
        step.phone({
          key: "phone_number",
          slug: "telefono",
          label: "Número de teléfono",
        }),
        step.autocomplete({
          key: "residence_state",
          slug: "estado",
          label: "Estado",
          autocomplete: "address-level1",
          source: autocompleteSource.usStates(),
        }),
        step.interstitial({
          key: "matching_offer",
          slug: "buscando",
          label: "Buscando",
          successLines: [
            { text: "Linea azul", color: "brand-navy" },
            { text: "Linea rosa", color: "accent" },
          ],
          benefits: ["Beneficio"],
        }),
        step.trustedFormConsent({
          key: "trustedform_consent",
          slug: "consentimiento",
          label: "Consentimiento",
          disclosure: "Texto de consentimiento.",
        }),
      ],
    });

    expect(flow.customVariables).toEqual({
      areaCode: "XX",
      areaName: "Example Area",
    });
    expect(flow.steps[0]).not.toHaveProperty("id");
    expect(flow.steps.map((stepDefinition) => [stepDefinition.kind, stepDefinition.template])).toEqual([
      ["choice", "choice"],
      ["text", "text"],
      ["phone", "phone"],
      ["autocomplete", "autocomplete"],
      ["interstitial", "interstitial"],
      ["trusted_form_consent", "trusted_form_consent"],
    ]);
    expect(flow.steps[0]?.behavior.autoAdvance).toBe(true);
    expect(flow.steps[2]?.behavior.mask).toBe("us_phone");
    expect(flow.steps[3]?.behavior.suggestions).toBe("autocomplete");
    expect(flow.steps[4]?.countsAsStep).toBeUndefined();
    expect(flow.steps[4] && isCountedStep(flow.steps[4])).toBe(false);
    expect(flow.steps[4]).toMatchObject({
      checkpointMode: "checkpoint_only",
      successLines: [
        { text: "Linea azul", color: "brand-navy" },
        { text: "Linea rosa", color: "accent" },
      ],
    });
    expect(flow.steps[5]).toMatchObject({
      kind: "trusted_form_consent",
      checkpointMode: "checkpoint_only",
      acceptedAnswer: "accepted",
      behavior: { trustedForm: "certify" },
      trustedForm: {
        delivery: "main_thread",
        scriptBaseUrl: "https://api.trustedform.com/trustedform.js",
      },
    });
  });

  it("uses the selected-script proxy for TrustedForm regardless of delivery mode", () => {
    const flow = defineFormFlow({
      name: "Proxy Test",
      status: "ACTIVE",
      customVariables: {},
      page: { name: "Page" },
      steps: [
        step.trustedFormConsent({
          key: "trustedform_consent",
          slug: "consentimiento",
          label: "Consentimiento",
          disclosure: "Texto de consentimiento.",
          trustedForm: {
            delivery: "main_thread",
            scriptProxyKey: "tfc",
          },
        }),
      ],
    });

    expect(flow.steps[0]).toMatchObject({
      trustedForm: {
        delivery: "main_thread",
        scriptProxyKey: "tfc",
        scriptBaseUrl: "/_instant/scripts/tfc.js",
      },
    });
  });
});

describe("repository structure", () => {
  const requiredReadmes = [
    "README.md",
    "src/README.md",
    "src/authoring/README.md",
    "src/authoring/flows/README.md",
    "src/authoring/flows/tn/README.md",
    "src/authoring/routes/README.md",
    "src/authoring/scripts/README.md",
    "src/platform/README.md",
    "src/platform/app/README.md",
    "src/platform/app/http/README.md",
    "src/platform/app/routes/README.md",
    "src/platform/flow/README.md",
    "src/platform/flow/dsl/README.md",
    "src/platform/persistence/README.md",
    "src/platform/rendering/README.md",
    "src/platform/rendering/client/README.md",
    "src/platform/rendering/templates/README.md",
    "src/platform/routing/README.md",
    "src/platform/scripts/README.md",
    "src/platform/steps/README.md",
    "src/platform/steps/adapters/README.md",
    "src/platform/steps/autocomplete/README.md",
    "src/platform/steps/phone/README.md",
    "src/platform/submissions/README.md",
    "src/shared/README.md",
    "src/shared/assets/README.md",
    "src/shared/data/README.md",
    "tests/README.md",
    "tests/unit/README.md",
    "tests/ui/README.md",
    "tests/ui/snapshots/README.md",
  ];

  it("keeps source files inside explicit domain folders", () => {
    const looseSourceFiles = readdirSync(join(repoRoot, "src")).filter((entry) => entry.endsWith(".ts"));

    expect(looseSourceFiles).toEqual([]);
  });

  it("keeps only the authoring, platform, and shared source buckets at the top level", () => {
    const topLevelSourceEntries = readdirSync(join(repoRoot, "src"))
      .filter((entry) => !entry.startsWith("."))
      .sort();

    expect(topLevelSourceEntries).toEqual(["README.md", "authoring", "platform", "shared"]);
  });

  it("keeps README documentation at each source and test folder boundary", () => {
    const missingReadmes = requiredReadmes.filter((readmePath) => !existsSync(join(repoRoot, readmePath)));

    expect(missingReadmes).toEqual([]);
  });
});

describe("submission validation", () => {
  const form = getRequiredTennesseeForm();

  it("rejects missing answers", () => {
    const result = validateSubmission(form, routeKey, { answers: { ...validAnswers, has_license: "" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "has_license",
        message: "This answer is required.",
      });
    }
  });

  it("rejects invalid choice option keys", () => {
    const result = validateSubmission(form, routeKey, { answers: { ...validAnswers, belongs_to_state: "maybe" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "belongs_to_state",
        message: "Answer is not a valid option.",
      });
    }
  });

  it("rejects phone numbers that cannot normalize to one US number", () => {
    const result = validateSubmission(form, routeKey, { answers: { ...validAnswers, phone_number: "615-555" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "phone_number",
        message: "Ingrese un número de teléfono válido de Estados Unidos.",
      });
    }
  });

  it("accepts formatted US phone numbers and normalizes them to E.164", () => {
    const result = validateSubmission(
      form,
      routeKey,
      { answers: validAnswers, trustedFormCertUrl },
      "2026-05-13T00:00:00.000Z",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.answers.phone_number).toBe("+16155551234");
      expect(result.payload.routeKey).toBe(routeKey);
      expect(result.payload).not.toHaveProperty("areaCode");
      expect(result.payload).not.toHaveProperty("formId");
      expect(result.payload).not.toHaveProperty("pageId");
      expect(result.payload.trustedFormCertUrl).toBe(trustedFormCertUrl);
      expect(result.payload.answers.trustedform_consent).toBeUndefined();
    }
  });

  it("requires residence state only when the visitor does not live in Tennessee", () => {
    const missingState = validateSubmission(form, routeKey, { answers: { ...validAnswers, belongs_to_state: "no" } });
    const invalidState = validateSubmission(form, routeKey, {
      answers: { ...validAnswers, belongs_to_state: "no", residence_state: "Not a state" },
    });
    const validNoPath = validateSubmission(
      form,
      routeKey,
      { answers: { ...validAnswers, belongs_to_state: "no", residence_state: "Texas" }, trustedFormCertUrl },
      "2026-05-13T00:00:00.000Z",
    );
    const staleYesPath = validateSubmission(
      form,
      routeKey,
      { answers: { ...validAnswers, belongs_to_state: "yes", residence_state: "Not a state" }, trustedFormCertUrl },
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

  it("accepts TrustedForm certificate URLs as top-level submission metadata", () => {
    const validResult = validateSubmission(
      form,
      routeKey,
      { answers: validAnswers, trustedFormCertUrl },
      "2026-05-13T00:00:00.000Z",
    );
    const invalidResult = validateSubmission(form, routeKey, {
      answers: validAnswers,
      trustedFormCertUrl: "https://example.com/not-a-cert",
    });

    expect(validResult.ok).toBe(true);
    if (validResult.ok) {
      expect(validResult.payload.trustedFormCertUrl).toBe(trustedFormCertUrl);
      expect(validResult.payload.answers.trustedform_consent).toBeUndefined();
    }

    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok) {
      expect(invalidResult.errors).toContainEqual({
        field: "trustedFormCertUrl",
        message: "TrustedForm certificate URL is not valid.",
      });
    }
  });

  it("requires a TrustedForm certificate URL when the authored consent step disallows fallback submissions", () => {
    const strictForm = {
      ...form,
      steps: form.steps.map((stepDefinition) =>
        stepDefinition.kind === "trusted_form_consent"
          ? {
              ...stepDefinition,
              trustedForm: {
                ...stepDefinition.trustedForm,
                allowSubmitWithoutCert: false,
              },
            }
          : stepDefinition,
      ),
    };
    const result = validateSubmission(strictForm, routeKey, { answers: validAnswers });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "trustedFormCertUrl",
        message: "TrustedForm certificate URL is required.",
      });
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

describe("selected script proxy", () => {
  it("registers TrustedForm Certify as an allowlisted selected script", () => {
    const trustedFormScript = selectedScripts.tfc;
    if (!trustedFormScript) {
      throw new Error("Expected selectedScripts.tfc to be registered.");
    }

    expect(trustedFormScript.key).toBe("tfc");
    expect(trustedFormScript.upstreamUrl).toBe("https://api.trustedform.com/trustedform.js");
    expect(trustedFormScript.fetchRuntime).toBe("node");
    expect(trustedFormScript.allowedQueryParams).toContain("field");
    expect(trustedFormScript.queryAliases).toMatchObject({
      f: "field",
      t: "use_tagged_consent",
      s: "sandbox",
    });
    expect(trustedFormScript.responseReplacements).toContainEqual({
      search: "https://cdn.trustedform.com/trustedform-1.11.7.js",
      replace: "/_instant/scripts/trustedform.com/tfc-core.js",
    });
    expect(selectedScripts["tfc-core"]).toMatchObject({
      key: "tfc-core",
      upstreamUrl: "https://cdn.trustedform.com/trustedform-1.11.7.js",
      fetchRuntime: "node",
    });
  });

  it("translates safe selected-script query aliases", () => {
    const trustedFormScript = selectedScripts.tfc;
    if (!trustedFormScript) {
      throw new Error("Expected selectedScripts.tfc to be registered.");
    }
    const result = buildScriptProxyUpstreamUrl(
      trustedFormScript,
      new URL("http://localhost/_instant/scripts/tfc.js?f=xxTrustedFormCertUrl&t=true&s=true"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.toString()).toBe(
        "https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&use_tagged_consent=true&sandbox=true",
      );
    }
  });

  it("rejects selected-script query parameters that are not allowlisted", () => {
    const trustedFormScript = selectedScripts.tfc;
    if (!trustedFormScript) {
      throw new Error("Expected selectedScripts.tfc to be registered.");
    }
    const result = buildScriptProxyUpstreamUrl(
      trustedFormScript,
      new URL("http://localhost/_instant/scripts/tfc.js?f=xxTrustedFormCertUrl&url=https://example.com/x.js"),
    );

    expect(result).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("server routing", () => {
  it("redirects the root route to Tennessee", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("redirects the Tennessee group route to its custom form route", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("redirects Tennessee custom to the first unanswered step without a checkpoint", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/custom"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/vive-en-tennessee");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("redirects Tennessee custom to the next unanswered step from a checkpoint", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom", {
        headers: {
          Cookie: createCheckpointCookie({
            belongs_to_state: "yes",
            has_license: "no",
          }),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/tiene-seguro");
  });

  it("redirects Tennessee custom to the residence-state step after a no answer", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom", {
        headers: {
          Cookie: createCheckpointCookie({
            belongs_to_state: "no",
          }),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/estado-donde-vive");
  });

  it("redirects pre-contact visitors to the matching step before contact information", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom", {
        headers: {
          Cookie: createCheckpointCookie(preContactAnswers),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/buscando-oferta");
  });

  it("guards contact steps until the matching step has been seen", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom/nombre", {
        headers: {
          Cookie: createCheckpointCookie(preContactAnswers),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/buscando-oferta");
  });

  it("keeps completed-but-not-seen matching visitors on the matching step", async () => {
    const handler = createFetchHandler();
    const resumeResponse = await handler(
      new Request("http://localhost/tn/custom", {
        headers: {
          Cookie: createCheckpointCookie(completedMatchingAnswers),
        },
      }),
    );
    const contactResponse = await handler(
      new Request("http://localhost/tn/custom/nombre", {
        headers: {
          Cookie: createCheckpointCookie(completedMatchingAnswers),
        },
      }),
    );
    const matchingResponse = await handler(
      new Request("http://localhost/tn/custom/buscando-oferta", {
        headers: {
          Cookie: createCheckpointCookie(completedMatchingAnswers),
        },
      }),
    );

    expect(resumeResponse.status).toBe(302);
    expect(resumeResponse.headers.get("Location")).toBe("/tn/custom/buscando-oferta");
    expect(contactResponse.status).toBe(302);
    expect(contactResponse.headers.get("Location")).toBe("/tn/custom/buscando-oferta");
    expect(matchingResponse.status).toBe(200);
    const matchingHtml = await matchingResponse.text();
    expect(matchingHtml).toContain('"matching_offer":"completed"');
    expect((matchingHtml.match(/<p class="step-count" data-step-count/g) ?? []).length).toBe(1);
    expect(matchingHtml).toContain('<div class="progress-meta">');
    expect(matchingHtml).toContain('<p class="step-count" data-step-count aria-hidden="true">Paso 5 de 9</p>');
    expect(matchingHtml).toContain('class="matching-benefit is-success is-visible"');
    expect(matchingHtml).toContain(
      '<span class="matching-success-line" data-color="brand-navy">Encontramos agentes listos para cotizarle.</span>',
    );
    expect(matchingHtml).toContain(
      '<span class="matching-success-line" data-color="accent">Descubra cuánto puede ahorrar.</span>',
    );
  });

  it("excludes matching from step count on the out-of-state path", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom/buscando-oferta", {
        headers: {
          Cookie: createCheckpointCookie(completedOutOfStateMatchingAnswers),
        },
      }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('"matching_offer":"completed"');
    expect((html.match(/<p class="step-count" data-step-count/g) ?? []).length).toBe(1);
    expect(html).toContain('<p class="step-count" data-step-count aria-hidden="true">Paso 6 de 10</p>');
  });

  it("allows contact steps after the matching checkpoint has been seen", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom/nombre", {
        headers: {
          Cookie: createCheckpointCookie(seenMatchingAnswers),
        },
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-step="7" data-step-kind="text" data-step-counted="true" aria-hidden="false"');
    expect((html.match(/<p class="step-count" data-step-count/g) ?? []).length).toBe(1);
    expect(html).toContain('<p class="step-count" data-step-count>Paso 6 de 9</p>');
  });

  it("guards the TrustedForm consent step until contact information is answered", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom/consentimiento", {
        headers: {
          Cookie: createCheckpointCookie({
            ...seenMatchingAnswers,
            first_name: "Ana",
            last_name: "Lopez",
          }),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/telefono");
  });

  it("redirects an already-seen matching step to the next contact step", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom/buscando-oferta", {
        headers: {
          Cookie: createCheckpointCookie(seenMatchingAnswers),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/nombre");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves checkpoint-dependent form pages without browser caching", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/tn/custom/buscando-oferta", {
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
      new Request("http://localhost/tn/custom", {
        headers: {
          Cookie: createCheckpointCookie({
            belongs_to_state: "maybe",
          }),
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/vive-en-tennessee");
  });

  it("guards valid but too-forward step URLs", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/custom/tiene-licencia"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/vive-en-tennessee");
  });

  it("guards the matching step until prior questions are answered", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/custom/buscando-oferta"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/vive-en-tennessee");
  });

  it("guards the residence-state step until Tennessee has been answered no", async () => {
    const handler = createFetchHandler();
    const noCookie = await handler(new Request("http://localhost/tn/custom/estado-donde-vive"));
    const yesCookie = await handler(
      new Request("http://localhost/tn/custom/estado-donde-vive", {
        headers: {
          Cookie: createCheckpointCookie({ belongs_to_state: "yes" }),
        },
      }),
    );
    const noWithoutResidence = await handler(
      new Request("http://localhost/tn/custom/tiene-licencia", {
        headers: {
          Cookie: createCheckpointCookie({ belongs_to_state: "no" }),
        },
      }),
    );

    expect(noCookie.status).toBe(302);
    expect(noCookie.headers.get("Location")).toBe("/tn/custom/vive-en-tennessee");
    expect(yesCookie.status).toBe(302);
    expect(yesCookie.headers.get("Location")).toBe("/tn/custom/tiene-licencia");
    expect(noWithoutResidence.status).toBe(302);
    expect(noWithoutResidence.headers.get("Location")).toBe("/tn/custom/estado-donde-vive");
  });

  it("redirects legacy English step slugs to Spanish step URLs", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/custom/belongs-to-state"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/vive-en-tennessee");
  });

  it("guards too-forward legacy English step slugs", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/custom/has-license"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom/vive-en-tennessee");
  });

  it("redirects unknown step slugs under valid route groups to the group fallback", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/not-real"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom");
  });

  it("redirects deeper unknown paths under valid route groups to the group fallback", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/not-real/extra"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom");
  });

  it("redirects unknown step slugs under nested form routes to the form route root", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/tn/custom/not-real"));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/tn/custom");
  });

  it("serves the cached WebP logo asset", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/assets/logo.webp"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("proxies selected scripts without forwarding visitor cookies", async () => {
    const originalFetch = globalThis.fetch;
    const registry = getBunFetchSelectedScriptRegistry();
    let fetchedUrl = "";
    let fetchedHeaders: Headers | undefined;

    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      fetchedUrl = input instanceof Request ? input.url : String(input);
      fetchedHeaders = new Headers(init?.headers);

      return Promise.resolve(
        new Response("window.__trustedFormProxyLoaded = true;", {
          headers: { "Content-Type": "application/javascript" },
        }),
      );
    }) as typeof fetch;

    try {
      const response = await proxySelectedScript(
        new Request("http://localhost/_instant/scripts/tfc.js?f=xxTrustedFormCertUrl&t=true", {
          headers: {
            Cookie: "private=value",
          },
        }),
        registry,
        "tfc",
      );
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
      expect(response.headers.get("Cache-Control")).toContain("max-age=300");
      expect(response.headers.get("Content-Length")).toBe(String(new TextEncoder().encode(body).byteLength));
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(body).toContain("__trustedFormProxyLoaded");
      expect(fetchedUrl).toBe(
        "https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&use_tagged_consent=true",
      );
      expect(fetchedHeaders?.get("Cookie")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes nested selected-script proxy URLs through their script key", async () => {
    const app = new Hono();
    registerScriptRoutes(app, getBunFetchSelectedScriptRegistry());
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (() =>
      Promise.resolve(new Response("window.__trustedFormRouteProxyLoaded = true;"))) as unknown as typeof fetch;

    try {
      const response = await app.fetch(
        new Request("http://localhost/_instant/scripts/trustedform.com/tfc.js?f=xxTrustedFormCertUrl&t=true"),
      );
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
      expect(body).toContain("__trustedFormRouteProxyLoaded");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies selected scripts from nested first-party paths that SDKs can inspect", async () => {
    const originalFetch = globalThis.fetch;
    const registry = getBunFetchSelectedScriptRegistry();
    let fetchedUrl = "";

    globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
      fetchedUrl = input instanceof Request ? input.url : String(input);
      return Promise.resolve(new Response("window.__trustedFormNestedProxyLoaded = true;"));
    }) as typeof fetch;

    try {
      const response = await proxySelectedScript(
        new Request("http://localhost/_instant/scripts/trustedform.com/tfc.js?f=xxTrustedFormCertUrl&t=true"),
        registry,
        "tfc",
      );
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("__trustedFormNestedProxyLoaded");
      expect(fetchedUrl).toBe(
        "https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&use_tagged_consent=true",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the configured Node fetch runtime for the TrustedForm selected script", async () => {
    let nodeFetchedUrl = "";
    const response = await proxySelectedScript(
      new Request("http://localhost/_instant/scripts/tfc.js?f=xxTrustedFormCertUrl&t=true"),
      selectedScripts,
      "tfc",
      {
        nodeFetch: (url) => {
          nodeFetchedUrl = url.toString();
          return Promise.resolve(new TextEncoder().encode("window.__trustedFormNodeFetchLoaded = true;").buffer);
        },
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(body).toContain("__trustedFormNodeFetchLoaded");
    expect(nodeFetchedUrl).toBe(
      "https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&use_tagged_consent=true",
    );
  });

  it("rewrites TrustedForm follow-up SDK loads to the first-party proxy", async () => {
    const response = await proxySelectedScript(
      new Request("http://localhost/_instant/scripts/trustedform.com/tfc.js?f=xxTrustedFormCertUrl&t=true"),
      selectedScripts,
      "tfc",
      {
        nodeFetch: () =>
          Promise.resolve(
            new TextEncoder().encode(
              'script.src="https://cdn.trustedform.com/trustedform-1.11.7.js";',
            ).buffer,
          ),
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('script.src="/_instant/scripts/trustedform.com/tfc-core.js";');
    expect(body).not.toContain("https://cdn.trustedform.com/trustedform-1.11.7.js");
  });

  it("returns a clean JavaScript 502 when the selected script upstream fetch fails", async () => {
    const originalFetch = globalThis.fetch;
    const registry = getBunFetchSelectedScriptRegistry();

    globalThis.fetch = (() => Promise.reject(new Error("network failed"))) as unknown as typeof fetch;

    try {
      const response = await proxySelectedScript(
        new Request("http://localhost/_instant/scripts/tfc.js?f=xxTrustedFormCertUrl"),
        registry,
        "tfc",
      );
      const body = await response.text();

      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(body).toContain("Unable to fetch selected script");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns a clean JavaScript 502 when the selected script upstream is not OK", async () => {
    const originalFetch = globalThis.fetch;
    const registry = getBunFetchSelectedScriptRegistry();

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("service unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      )) as unknown as typeof fetch;

    try {
      const response = await proxySelectedScript(
        new Request("http://localhost/_instant/scripts/tfc.js?f=xxTrustedFormCertUrl"),
        registry,
        "tfc",
      );
      const body = await response.text();

      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
      expect(response.headers.get("Content-Length")).toBe(String(new TextEncoder().encode(body).byteLength));
      expect(body).toContain("Unable to fetch selected script");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns a clean JavaScript 502 when the selected script body cannot be buffered", async () => {
    const originalFetch = globalThis.fetch;
    const registry = getBunFetchSelectedScriptRegistry();
    const upstreamResponse = new Response("window.fail = false;", {
      headers: { "Content-Type": "application/javascript" },
    });
    Object.defineProperty(upstreamResponse, "arrayBuffer", {
      value: () => Promise.reject(new Error("read failed")),
    });

    globalThis.fetch = (() => Promise.resolve(upstreamResponse)) as unknown as typeof fetch;

    try {
      const response = await proxySelectedScript(
        new Request("http://localhost/_instant/scripts/tfc.js?f=xxTrustedFormCertUrl"),
        registry,
        "tfc",
      );
      const body = await response.text();

      expect(response.status).toBe(502);
      expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(body).toContain("Unable to fetch selected script");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects unknown or unsafe selected script proxy requests", async () => {
    const handler = createFetchHandler();

    const unknownResponse = await handler(new Request("http://localhost/_instant/scripts/not-real.js"));
    const unsafeQueryResponse = await handler(new Request("http://localhost/_instant/scripts/tfc.js?source=https://evil.test/x.js"));

    expect(unknownResponse.status).toBe(404);
    expect(unsafeQueryResponse.status).toBe(400);
  });

  it("serves Partytown runtime assets", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/~partytown/partytown.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("serves a no-store matching preview route without the full form flow", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/__preview/tn/custom/buscando-oferta"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(html).toContain('"previewMode":true');
    expect(html).toContain('"url":"/__preview/tn/custom/buscando-oferta"');
    expect(html).toContain(".matching-status:empty");
    expect(html).toContain('data-matching-status></p>');
    expect(html).toContain("Encontramos agentes listos para cotizarle.");
    expect(html).toContain("Descubra cuánto puede ahorrar.");
    expect(html).toContain('data-step="0" data-step-kind="interstitial" data-step-counted="false" aria-hidden="false"');
    expect(html).not.toContain("¿Usted vive en Tennessee?");
    expect(html).not.toContain('"slug":"nombre"');
  });

  it("returns an unavailable page for unsupported form routes", async () => {
    const handler = createFetchHandler();
    const response = await handler(new Request("http://localhost/ga"));
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain("404");
    expect(html).toContain("Esta página no existe o ya no está disponible.");
    expect(html).toContain('href="/tn/custom"');
    expect(html).not.toContain("formulario de Tennessee");
  });

  it("sets a checkpoint cookie for valid partial answers", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "belongs_to_state", answer: "yes" }),
      }),
    );
    const body = await response.json();
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, nextUrl: "/tn/custom/tiene-licencia" });
    expect(setCookie).toContain(`${getCheckpointCookieName(routeKey)}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=604800");
  });

  it("routes completed pre-contact answers through the matching checkpoint", async () => {
    const handler = createFetchHandler();
    const carsResponse = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
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
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
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
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
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
    expect(carsBody).toMatchObject({ ok: true, nextUrl: "/tn/custom/buscando-oferta" });
    expect(completedResponse.status).toBe(200);
    expect(completedBody).toMatchObject({
      ok: true,
      nextUrl: "/tn/custom/buscando-oferta",
      answers: completedMatchingAnswers,
    });
    expect(matchingResponse.status).toBe(200);
    expect(matchingBody).toMatchObject({
      ok: true,
      nextUrl: "/tn/custom/nombre",
      answers: seenMatchingAnswers,
    });
  });

  it("skips the matching route from previous-step checkpoints after it has been seen", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
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
    expect(body).toMatchObject({ ok: true, nextUrl: "/tn/custom/nombre" });
  });

  it("routes no Tennessee answers through the residence-state checkpoint", async () => {
    const handler = createFetchHandler();
    const noResponse = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "belongs_to_state", answer: "no" }),
      }),
    );
    const noBody = await noResponse.json();
    const cookie = noResponse.headers.get("Set-Cookie")?.split(";")[0] ?? "";
    const stateResponse = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
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
    expect(noBody).toMatchObject({ ok: true, nextUrl: "/tn/custom/estado-donde-vive" });
    expect(stateResponse.status).toBe(200);
    expect(stateBody).toMatchObject({
      ok: true,
      nextUrl: "/tn/custom/tiene-licencia",
      answers: {
        belongs_to_state: "no",
        residence_state: "TX",
      },
    });
  });

  it("routes completed phone answers to the TrustedForm consent step", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie({
            ...seenMatchingAnswers,
            first_name: "Ana",
            last_name: "Lopez",
          }),
        },
        body: JSON.stringify({ questionKey: "phone_number", answer: "(615) 555-1234" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      nextUrl: "/tn/custom/consentimiento",
      answers: preConsentAnswers,
    });
  });

  it("marks checkpoint cookies secure when served over HTTPS", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("https://localhost/api/forms/tn_custom/checkpoints", {
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
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "belongs_to_state", answer: "maybe" }),
      }),
    );
    const invalidPhone = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "phone_number", answer: "+52 55 1234 5678" }),
      }),
    );
    const invalidState = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie({ belongs_to_state: "no" }),
        },
        body: JSON.stringify({ questionKey: "residence_state", answer: "Not a state" }),
      }),
    );
    const hiddenState = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey: "residence_state", answer: "Texas" }),
      }),
    );
    const invalidMatching = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie(preContactAnswers),
        },
        body: JSON.stringify({ questionKey: "matching_offer", answer: "nope" }),
      }),
    );
    const prematureSeenMatching = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie(preContactAnswers),
        },
        body: JSON.stringify({ questionKey: "matching_offer", answer: "seen" }),
      }),
    );
    const tooEarlyMatching = await handler(
      new Request("http://localhost/api/forms/tn_custom/checkpoints", {
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
      new Request("http://localhost/tn/custom/nombre", {
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
    expect(html).toContain('value="Ana"');
    expect(html).toContain('data-step="7" data-step-kind="text" data-step-counted="true" aria-hidden="false"');
    expect(html).not.toContain('name="belongs_to_state"');
  });

  it("accepts valid local submissions and logs the payload", async () => {
    const loggedPayloads: unknown[] = [];
    const handler = createFetchHandler({ logger: (payload) => loggedPayloads.push(payload) });
    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: { ...validAnswers, matching_offer: "seen" }, trustedFormCertUrl }),
      }),
    );

    expect(response.status).toBe(201);
    expect(loggedPayloads).toHaveLength(1);
    expect(loggedPayloads[0]).toMatchObject({
      routeKey,
      pageName: "Seguros Aseguranza",
      trustedFormCertUrl,
    });
    expect(loggedPayloads[0]).not.toHaveProperty("areaCode");
    expect(loggedPayloads[0]).not.toHaveProperty("formId");
    expect(loggedPayloads[0]).not.toHaveProperty("pageId");
    expect((loggedPayloads[0] as { answers?: Record<string, string> }).answers?.matching_offer).toBeUndefined();
    expect((loggedPayloads[0] as { answers?: Record<string, string> }).answers?.trustedform_consent).toBeUndefined();
  });

  it("clears the checkpoint cookie after a successful final submission", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie({ belongs_to_state: "yes" }),
        },
        body: JSON.stringify({ answers: validAnswers, trustedFormCertUrl }),
      }),
    );
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(201);
    expect(setCookie).toContain(`${getCheckpointCookieName(routeKey)}=`);
    expect(setCookie).toContain("Max-Age=0");
  });
});

describe("form rendering", () => {
  it("keeps source inline assets in dev and serves built inline assets in production", async () => {
    const devHtml = await withNodeEnv("development", () => renderTennesseeForm());
    const productionHtml = await withNodeEnv("production", () => renderTennesseeForm());
    const productionTemplateHtml = await withNodeEnv("production", () =>
      renderTennesseeForm({ formConfigExpression: FORM_CONFIG_PLACEHOLDER_EXPRESSION }),
    );

    expect(getInlineAssetMode("development")).toBe("source");
    expect(getInlineAssetMode("production")).toBe("built");
    expect(buildInlineCss(":root { --brand-navy: #073b8e; color: var(--brand-navy); }")).toBe(
      ":root{--a:#073b8e;color:var(--a)}",
    );

    expect(devHtml).toContain("--brand-navy: #073b8e");
    expect(devHtml).toContain("\n      :root");
    expect(productionHtml).toContain("<style>");
    expect(productionHtml).toContain("--a:#073b8e");
    expect(productionHtml).toContain("var(--a)");
    expect(productionHtml).not.toContain("--brand-navy:");
    expect(productionHtml).not.toContain("var(--brand-navy)");
    expect(productionHtml).toContain("<script>window.__FORM_CONFIG__=");
    expect(productionTemplateHtml).toContain('"__FORM_CONFIG_JSON__"');
    expect(productionHtml).toContain("<script>");
    expect(productionHtml).not.toContain('class="form-panel"');
    expect(productionHtml).not.toContain('id="lead-form"');
    expect(productionHtml).toContain('type="button"');
    expect(productionHtml).not.toContain('type="p"');
    expect(productionHtml).toContain("data-option");
    expect(productionHtml).not.toContain("¿Usted tiene licencia");
    expect(productionHtml).not.toContain('"autocompleteSources"');
    expect(productionHtml).not.toContain("\n      (() => {");
  });

  it("builds a static non-PII transition JS asset for snappy production step changes", async () => {
    const form = getRequiredTennesseeForm();
    const stepUrlOverrides = Object.fromEntries(
      form.steps.map((stepDefinition) => [
        stepDefinition.key,
        `/tn/custom/${getStepSlug(stepDefinition)}`,
      ]),
    );
    const transitionAsset = await buildTransitionAsset(form, ["tn", "custom"], stepUrlOverrides);
    const devHtml = await renderTennesseeForm({
      transitionAssetUrl: `/_instant/forms/${transitionAsset.hash}/transition.js`,
    });
    const productionHtml = await withNodeEnv("production", () =>
      renderTennesseeForm({
        transitionAssetUrl: `/_instant/forms/${transitionAsset.hash}/transition.js`,
      }),
    );

    expect(transitionAsset.hash).toMatch(/^[a-f0-9]{16}$/u);
    expect(transitionAsset.asset.steps).toHaveLength(form.steps.length);
    expect(transitionAsset.asset.route).toBe("/tn/custom");
    expect(transitionAsset.body).toContain("__INSTANT_FORM_RUNTIME__");
    expect(transitionAsset.body).toContain("registerTransitionAsset");
    expect(transitionAsset.body).toContain("registerBehaviorModule");
    expect(transitionAsset.body).toContain("/tn/custom");
    expect(transitionAsset.body).toContain("trustedForm");
    expect(transitionAsset.body).not.toContain("Ana");
    expect(transitionAsset.body).not.toContain("Lopez");
    expect(transitionAsset.body).not.toContain("6155551234");
    expect(transitionAsset.body).not.toContain('class="form-panel"');
    expect(transitionAsset.body).not.toContain('className="autocomplete-suggestion"');
    expect(transitionAsset.body).toContain('className="f"');
    expect(transitionAsset.body).not.toContain('class="autocomplete-suggestion-value"');
    expect(transitionAsset.body).toContain('class="e"');
    expect(transitionAsset.body).not.toContain('".option"');
    expect(transitionAsset.body).not.toContain('".text-input"');
    expect(transitionAsset.body).not.toContain('".actions"');
    expect(transitionAsset.body).not.toContain('".consent-card"');
    expect(transitionAsset.body).toContain('".ae"');
    expect(transitionAsset.body).toContain('".ar"');
    expect(productionHtml).toContain("/_instant/forms/");
    expect(productionHtml).toContain("transition.js");
    expect(devHtml).toContain("function preloadTransitionAsset()");
    expect(devHtml).toContain("void loadTransitionAsset();");
    expect(devHtml).toContain("const transitionAssetWaitBudgetMs = 160");
    expect(devHtml).toContain("async function waitForTransitionAssetBudget()");
    expect(devHtml).toContain("Promise.race");
    expect(devHtml).toContain("function navigateWithTransitionAsset(url, mode)");
    expect(devHtml).toContain("function queueCheckpoint(questionKey, answer, options = {})");
    expect(devHtml).toContain("function waitForPendingCheckpoints()");
    expect(devHtml).toContain("async function advanceOptimistically(question, answer, options = {})");
    expect(devHtml).toContain("await waitForPendingCheckpoints()");
    expect(devHtml).not.toContain("runAfterPageSettles");
  });

  it("renders the logo and brand theme tokens", async () => {
    const html = await renderTennesseeForm();

    expect(html).toContain('src="/assets/logo.webp"');
    expect(html).not.toContain("Seguro para Latinos en Tennessee");
    expect(html).toContain("--brand-navy: #073b8e");
    expect(html).toContain("--brand-blue: #064df6");
    expect(html).toContain("--brand-pink: #f80057");
    expect(html).toContain("background: var(--accent)");
  });

  it("uses larger desktop controls while preserving mobile sizing rules", async () => {
    const html = await renderTennesseeForm();

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

  it("wires choice answers to delayed auto-advance on click and number keys", async () => {
    const html = await renderTennesseeForm();

    expect(html).toContain('registerBehaviorModule("choice"');
    expect(html).toContain("function advanceAfterChoiceSelection(ctx, question, answer)");
    expect(html).toContain("function saveCheckpoint(questionKey, answer)");
    expect(html).toContain("ctx.advanceOptimistically(question, answer)");
    expect(html).toContain("/checkpoints");
    expect(html).not.toContain('registerBehaviorModule("phone"');
    expect(html).not.toContain("function normalizeUsPhoneNumber(value)");
    expect(html).not.toContain('registerBehaviorModule("autocomplete"');
    expect(html).not.toContain('registerBehaviorModule("interstitial"');
    expect(html).not.toContain('registerBehaviorModule("trusted_form_consent"');
    expect(html).toContain('form.addEventListener("change"');
    expect(html).toContain("advanceAfterChoiceSelection(ctx, question, target.value)");
    expect(html).toContain("function getClickedChoiceInput(target, step)");
    expect(html).toContain('target.closest(".option")');
    expect(html).toContain("option.querySelector(\"input[type='radio']\")");
    expect(html).toContain("advanceAfterChoiceSelection(ctx, question, input.value)");
    expect(html).toContain("function isTypingTarget(value)");
    expect(html).toContain('document.addEventListener("keydown"');
    expect(html).toContain("getActiveBehavior()?.onDocumentKeyDown?.");
    expect(html).toContain("event.preventDefault()");
    expect(html).toContain("option.checked = true");
    expect(html).toContain("advanceAfterChoiceSelection(ctx, question, option.value)");
    expect(html).toContain("}, 180);");
  });

  it("renders the branded matching step with one-time auto-continue wiring", async () => {
    const html = await renderTennesseeForm( {
      activeStepIndex: 6,
      answers: preContactAnswers,
    });

    expect(html).toContain('"kind":"interstitial"');
    expect(html).toContain('"slug":"buscando-oferta"');
    expect(html).toContain('"url":"/tn/custom/buscando-oferta"');
    expect(html).not.toContain("Buscando opciones para ti...");
    expect(html).toContain("Estamos buscando su seguro ideal");
    expect(html).toContain("Revisando sus respuestas");
    expect(html).toContain("Buscando agentes disponibles");
    expect(html).toContain("Priorizando atención en español");
    expect(html).toContain("Preparando opciones en {{areaName}}");
    expect(html).toContain("Encontramos agentes listos para cotizarle.");
    expect(html).toContain("Descubra cuánto puede ahorrar.");
    expect(html).toContain('"successLines":[{"text":"Encontramos agentes listos para cotizarle.","color":"brand-navy"}');
    expect(html).toContain('registerBehaviorModule("interstitial"');
    expect(html).not.toContain('registerBehaviorModule("phone"');
    expect(html).not.toContain('registerBehaviorModule("trusted_form_consent"');
    expect(html).toContain("function showMatchingSuccess(question, elements, options = {})");
    expect(html).toContain('"countsAsStep":false');
    expect(html).toContain("return question && question.countsAsStep !== false");
    expect(html).toContain("function getCountedVisibleStepIndexes()");
    expect(html).toContain("function getRenderedCountedStepNumber()");
    expect(html).toContain("progressBar.style.width = (countedStepNumber / countedStepCount) * 100 + \"%\"");
    expect(html).toContain("let matchingTextTransitionId = 0;");
    expect(html).toContain("matchingTextTransitionId += 1;");
    expect(html).toContain("function applyMatchingBenefitText(elements, text, className)");
    expect(html).toContain("function fadeMatchingBenefitIn(elements, transitionId)");
    expect(html).toContain("function setMatchingBenefitText(elements, text, className, options = {})");
    expect(html).toContain('setMatchingBenefitText(elements, question.successLines, "is-success", options)');
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
    expect(html).toContain("function getMatchingBenefitTimeline(benefits)");
    expect(html).toContain("const benefitTimeline = getMatchingBenefitTimeline(question.benefits.map((benefit) => formatMatchingBenefit(ctx, benefit)))");
    expect(html).toContain("duration: matchingBenefitDisplayMs");
    expect(html).toContain("startsAt += matchingBenefitDisplayMs");
    expect(html).toContain("benefitTiming.startsAt");
    expect(html).toContain("const successDelay = benefitTimeline.reduce((totalDuration, benefitTiming) => totalDuration + benefitTiming.duration, 0) || matchingBenefitDisplayMs");
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
    expect(html).toContain('.matching-success-line[data-color="brand-navy"]');
    expect(html).toContain("color: var(--brand-navy)");
    expect(html).toContain('.matching-success-line[data-color="accent"]');
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
    expect(html).toContain("function renderMatchingBenefitContent(element, content, className)");
    expect(html).toContain("element.replaceChildren()");
    expect(html).toContain('if (className !== "is-success")');
    expect(html).toContain('String(content).split("\\n")');
    expect(html).toContain('lineElement.className = "matching-success-line"');
    expect(html).toContain("lineElement.dataset.color = line.color");
    expect(html).toContain("setMatchingBenefitText(elements, benefitTimeline[0]?.text ?? \"\", \"\", { initial: true })");
    expect(html).not.toContain("onTextShown");
    expect(html).toContain("getContext");
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
    expect(html).toContain("function completeMatchingStep(ctx, question, runId)");
    expect(html).toContain("function replaceToUrl(url)");
    expect(html).toContain("completedMatchingSteps.add(question.key)");
    expect(html).toContain("!completedMatchingSteps.has(question.key)");
    expect(html).toContain('ctx.saveCheckpoint(question.key, question.completionAnswer)');
    expect(html).toContain('ctx.saveCheckpoint(question.key, question.seenAnswer)');
    expect(html).toContain("ctx.replaceToUrl(nextUrl ?? ctx.getRenderedNextUrl())");
    expect(html).toContain('ctx.updateNextButton("Siguiente", false)');
    expect(html).not.toContain("matching-loader");
    expect(html).not.toContain("data-matching-retry");
    expect(html).not.toContain('.form-panel[data-active-kind="interstitial"] footer');
    expect(html).toContain("overflow: visible");
  });

  it("wires a forgiving US phone mask without blocking browser autofill", async () => {
    const firstNameHtml = await renderTennesseeForm( {
      activeStepIndex: 7,
      answers: seenMatchingAnswers,
    });
    const lastNameHtml = await renderTennesseeForm( {
      activeStepIndex: 8,
      answers: { ...seenMatchingAnswers, first_name: "Ana" },
    });
    const html = await renderTennesseeForm( {
      activeStepIndex: 9,
      answers: { ...seenMatchingAnswers, first_name: "Ana", last_name: "Lopez" },
    });

    expect(html).toContain("font-weight: 400;");
    expect(html).toContain("padding: 6px 0 6px;");
    expect(html).toContain(".text-input::placeholder");
    expect(firstNameHtml).toContain('placeholder="Escriba su nombre aquí"');
    expect(lastNameHtml).toContain('placeholder="Escriba su apellido aquí"');
    expect(html).toContain('placeholder="Escriba su telefono aquí"');
    expect(html).toContain('form.addEventListener("input"');
    expect(html).toContain('form.addEventListener("beforeinput"');
    expect(html).toContain('registerBehaviorModule("phone"');
    expect(html).not.toContain('registerBehaviorModule("autocomplete"');
    expect(html).not.toContain('registerBehaviorModule("trusted_form_consent"');
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

  it("renders TrustedForm consent as an authored final step", async () => {
    const phoneHtml = await renderTennesseeForm({
      activeStepIndex: 9,
      answers: { ...seenMatchingAnswers, first_name: "Ana", last_name: "Lopez" },
    });
    const html = await renderTennesseeForm({
      activeStepIndex: 10,
      answers: preConsentAnswers,
    });

    expect(phoneHtml).not.toContain('"trustedFormPreload"');
    expect(phoneHtml).not.toContain('"fieldName":"xxTrustedFormCertUrl"');
    expect(html).toContain('"kind":"trusted_form_consent"');
    expect(html).toContain('"slug":"consentimiento"');
    expect(html).toContain('"submitLabel":"Enviar"');
    expect(html).toContain('"trustedForm":{"fieldName":"xxTrustedFormCertUrl"');
    expect(html).toContain('"delivery":"partytown"');
    expect(html).toContain('"scriptProxyKey":"tfc"');
    expect(html).toContain('"scriptBaseUrl":"/_instant/scripts/trustedform.com/tfc.js"');
    expect(html).toContain('"partytownLib":"/~partytown/"');
    expect(html).toContain('"partytownScriptUrl":"/~partytown/partytown.js"');
    expect(html).toContain('"allowSubmitWithoutCert":true');
    expect(html).toContain('data-step="10" data-step-kind="trusted_form_consent"');
    expect(html).toContain('data-tf-element-role="consent-language"');
    expect(html).toContain('data-tf-element-role="consent-opt-in"');
    expect(html).toContain('data-tf-element-role="consent-grantor-name"');
    expect(html).toContain('data-tf-element-role="consent-grantor-phone"');
    expect(html).toContain("Ana Lopez");
    expect(html).toContain("(615) 555-1234");
    expect(html).toContain("function loadTrustedFormSdk(trustedForm)");
    expect(html).toContain("function loadTrustedFormSdkWithPartytown(trustedForm, sdkUrl)");
    expect(html).toContain("function ensurePartytownReady(trustedForm)");
    expect(html).toContain("function getTrustedFormGlobalState()");
    expect(html).toContain("function shouldUseTrustedFormProxyAliases(trustedForm, url)");
    expect(html).toContain('script.type = "text/partytown"');
    expect(html).toContain('window.dispatchEvent(new CustomEvent("ptupdate"))');
    expect(html).not.toContain("function preloadTrustedFormSdk(trustedForm)");
    expect(html).toContain("function ensureTrustedFormReady(trustedForm)");
    expect(html).toContain("function waitForTrustedFormCertUrl(trustedForm)");
    expect(html).toContain("function getTrustedFormCertUrl(trustedForm = window.__FORM_CONFIG__.currentStep.trustedForm)");
    expect(html).toContain('ctx.updateNextButton("Preparando...", true)');
    expect(html).toContain("No pudimos preparar el certificado de consentimiento");
    expect(html).toContain("trustedFormCertUrl");
    expect(html).toContain('document.getElementById("next-button")?.setAttribute("data-tf-element-role", "submit")');
    expect(html).toContain('ctx.form.setAttribute("data-tf-element-role", "offer")');
    expect(html).toContain("/_instant/scripts/trustedform.com/tfc.js");
    expect(html).not.toContain("https://api.trustedform.com/trustedform.js");
  });

  it("renders a lightweight error modal instead of inline form errors", async () => {
    const html = await renderTennesseeForm();

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

  it("synthetically submits focused text fields on mobile blur", async () => {
    const html = await renderTennesseeForm( {
      activeStepIndex: 7,
      answers: seenMatchingAnswers,
    });

    expect(html).toContain("function isMobileViewport()");
    expect(html).toContain('window.matchMedia("(max-width: 560px)").matches');
    expect(html).toContain("function shouldSubmitTextInputOnMobileBlur(event, ctx, question, step)");
    expect(html).toContain("function shouldSubmitTextInputOnMobileOutsidePointer(event, ctx, question, step)");
    expect(html).toContain("function validateCurrentStep(options = {})");
    expect(html).toContain("options.focusInvalid !== false");
    expect(html).toContain("async function handleNext(options = {})");
    expect(html).toContain("const shouldFocusInvalid = options.focusInvalid ?? !isMobileViewport();");
    expect(html).toContain("validateCurrentStep({ focusInvalid: shouldFocusInvalid })");
    expect(html).toContain("validate(ctx, question, step, { focusInvalid: false })");
    expect(html).toContain("function getCurrentTextInput()");
    expect(html).toContain("function getValidationErrorReturnFocusTarget(shouldFocusInvalid)");
    expect(html).toContain("returnFocusTarget: getValidationErrorReturnFocusTarget(options.focusInvalid !== false)");
    expect(html).toContain("let focusedTextInput");
    expect(html).toContain('form.addEventListener("focusin"');
    expect(html).toContain('form.addEventListener("focusout"');
    expect(html).toContain('document.addEventListener("pointerdown"');
    expect(html).not.toContain("if (shouldSubmitTextInputOnMobileBlur(event)) {\n            nextButton.click();");
    expect(html).toContain("isActionPointerDown");
    expect(html).toContain('actions.addEventListener("pointerdown"');
  });

  it("includes step URLs and browser history handling", async () => {
    const html = await renderTennesseeForm();

    expect(html).toContain('"activeStepIndex":0');
    expect(html).toContain('"initialAnswers":{}');
    expect(html).toContain('"routeKey":"tn_custom"');
    expect(html).toContain('"customVariables":{"areaCode":"TN","areaName":"Tennessee"}');
    expect(html).not.toContain('"stateCode"');
    expect(html).toContain('"slug":"vive-en-tennessee"');
    expect(html).not.toContain('"slug":"estado-donde-vive"');
    expect(html).not.toContain('"slug":"buscando-oferta"');
    expect(html).toContain('"url":"/tn/custom/vive-en-tennessee"');
    expect(html).not.toContain('"url":"/tn/custom/estado-donde-vive"');
    expect(html).not.toContain('"url":"/tn/custom/buscando-oferta"');
    expect(html).toContain('"stepUrlsBySlug":{"vive-en-tennessee":"/tn/custom/vive-en-tennessee"');
    expect(html).toContain('"estado-donde-vive":"/tn/custom/estado-donde-vive"');
    expect(html).toContain('"buscando-oferta":"/tn/custom/buscando-oferta"');
    expect(html).not.toContain('"showWhen":{"questionKey":"belongs_to_state","answer":"no"}');
    expect(html).not.toContain('"autocompleteSources"');
    expect(html).toContain("window.history.replaceState");
    expect(html).toContain('window.addEventListener("popstate"');
    expect(html).toContain("getStepIndexForPath(window.location.pathname)");
    expect(html).toContain("currentQuestion.url !== window.location.pathname");
  });

  it("renders the requested active step and saved answers", async () => {
    const html = await renderTennesseeForm( {
      activeStepIndex: 1,
      answers: { belongs_to_state: "no", residence_state: "TX" },
    });

    expect(html).toContain('data-step="1" data-step-kind="autocomplete" data-step-counted="true" aria-hidden="false"');
    expect((html.match(/<article class="step"/g) ?? []).length).toBe(1);
    expect(html).not.toContain('data-step="0" data-step-kind="choice"');
    expect(html).toContain('value="TX"');
    expect(html).toContain('"initialAnswers":{"belongs_to_state":"no","residence_state":"TX"}');
    expect(html).toContain('"showWhen":{"questionKey":"belongs_to_state","answer":"no"}');
    expect(html).toContain('"autocompleteSources"');
  });

  it("renders the mobile-friendly state autocomplete wiring", async () => {
    const html = await renderTennesseeForm( {
      activeStepIndex: 1,
      answers: { belongs_to_state: "no" },
    });

    expect(html).toContain('data-autocomplete-input="true"');
    expect(html).toContain('placeholder="Escriba su estado aquí"');
    expect(html).toContain("data-autocomplete-suggestions");
    expect(html).toContain("function normalizeUsState(ctx, value)");
    expect(html).toContain("class=\"autocomplete-suggestions-shell\"");
    expect(html).toContain("data-autocomplete-suggestions-shell");
    expect(html).toContain('"source":"usStates"');
    expect(html).toContain('"autocompleteSources"');
    expect(html).toContain('"washington d c"');
    expect(html).toContain("function getAutocompleteConfig(question)");
    expect(html).toContain("function getAutocompleteSuggestions(value, autocompleteConfig)");
    expect(html).toContain("function getAutocompleteMatchScore(item, autocompleteConfig, normalizedQuery)");
    expect(html).toContain("Number.POSITIVE_INFINITY");
    expect(html).toContain("autocompleteConfig.getLabel(left.item).localeCompare(autocompleteConfig.getLabel(right.item))");
    expect(html).not.toContain(".slice(0, 3);");
    expect(html).toContain('#steps:has(.step[data-step-kind="autocomplete"][aria-hidden="false"])');
    expect(html).toContain('.step[data-step-kind="autocomplete"][aria-hidden="false"]');
    expect(html).toContain('.step[data-step-kind="autocomplete"][aria-hidden="false"] .autocomplete-field');
    expect(html).toContain("grid-template-rows: auto minmax(0, 1fr);");
    expect(html).toContain("align-self: stretch;");
    expect(html).toContain("height: auto;");
    expect(html).not.toContain("height: 220px;");
    expect(html).not.toContain("height: 180px;");
    expect(html).toContain("overflow-y: auto;");
    expect(html).toContain("overscroll-behavior: contain;");
    expect(html).toContain("autocomplete-scroll-fade-top");
    expect(html).toContain("autocomplete-scroll-fade-bottom");
    expect(html).toContain("function updateAutocompleteSuggestionScrollHints(suggestions)");
    expect(html).toContain("window.requestAnimationFrame(() =>");
    expect(html).toContain("data-can-scroll-up");
    expect(html).toContain("data-can-scroll-down");
    expect(html).toContain('target.matches("[data-autocomplete-suggestions]")');
    expect(html).toContain("function updateAutocompleteSuggestions(input, question)");
    expect(html).toContain('target.closest("[data-autocomplete-suggestion]")');
    expect(html).toContain("void ctx.handleNext()");
    expect(html).toContain('step?.querySelector("[data-autocomplete-suggestions-shell]")');
    expect(html).toContain("Ingrese un estado válido de Estados Unidos.");
  });
});

function getRequiredTennesseeForm() {
  return getRequiredTennesseeRoute().form;
}

function getRequiredTennesseeRoute() {
  const routeEntry = getFormRouteByRouteKey(formRoutes, routeKey);

  if (!routeEntry) {
    throw new Error("Expected Tennessee form route to exist.");
  }

  return routeEntry;
}

function renderTennesseeForm(options: Parameters<typeof renderFormPage>[1] = {}): Promise<string> {
  const form = getRequiredTennesseeForm();

  return renderFormPage(form, {
    routeKey,
    stepUrlOverrides: createTennesseeStepUrlOverrides(form),
    ...options,
  });
}

function createTennesseeStepUrlOverrides(form = getRequiredTennesseeForm()): Record<string, string> {
  return Object.fromEntries(
    form.steps.map((stepDefinition) => [
      stepDefinition.key,
      `/tn/custom/${getStepSlug(stepDefinition)}`,
    ]),
  );
}

function createCheckpointCookie(answers: Record<string, string>): string {
  return `${getCheckpointCookieName(routeKey)}=${encodeCheckpointAnswers(answers)}`;
}

function getBunFetchSelectedScriptRegistry() {
  const trustedFormScript = selectedScripts.tfc;
  if (!trustedFormScript) {
    throw new Error("Expected selectedScripts.tfc to be registered.");
  }

  return {
    tfc: {
      ...trustedFormScript,
      fetchRuntime: "bun" as const,
    },
  };
}

async function withNodeEnv<T>(nodeEnv: string | undefined, callback: () => T | Promise<T>): Promise<T> {
  const previousNodeEnv = process.env.NODE_ENV;

  if (nodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = nodeEnv;
  }

  try {
    return await callback();
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
}
