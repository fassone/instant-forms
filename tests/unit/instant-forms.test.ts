import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  googleTagManager,
  gtmContainerIdSchema,
  metaTestEventCodeSchema,
} from "../../src/authoring/integrations/google-tag-manager";
import { trustedFormCertify } from "../../src/authoring/integrations/trusted-form";
import { requestProxies } from "../../src/authoring/proxies/registry";
import { selectedScripts } from "../../src/authoring/scripts/registry";
import { esAutoInsuranceTemplate } from "../../src/authoring/templates/es-auto-insurance";
import { formRoutes } from "../../src/authoring/routes/registry";
import { createFetchHandler } from "../../src/platform/app/server";
import { registerFormRoutes } from "../../src/platform/app/routes/forms";
import { registerScriptRoutes } from "../../src/platform/app/routes/scripts";
import {
  autocompleteSource,
  consentMd,
  defineFormFlow,
  defineFormTemplate,
  getStepDynamicResolverDependencies,
  getStepSlug,
  isCountedStep,
  md,
  phoneDisplay,
  resolveStepDynamicValues,
  stateDisplay,
  step,
  text,
  tfTag,
  z,
} from "../../src/platform/flow";
import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";
import {
  FORM_CONFIG_PLACEHOLDER_EXPRESSION,
  buildTransitionAsset,
  createLifecycleTrackingPayload,
  renderFormPage,
} from "../../src/platform/rendering";
import {
  applyProductionTokens,
  applyProductionTokensToScript,
  buildInlineCss,
  getInlineAssetMode,
} from "../../src/platform/rendering/inline-assets";
import { renderConsentMarkdownToHtml, renderMarkdownToHtml } from "../../src/platform/rendering/markdown";
import {
  defineFormRoutes,
  getFormRouteByRouteKey,
  redirectTo,
  registerFormRoutePages,
  unavailable,
} from "../../src/platform/routing";
import {
  buildRequestProxySpecialRouteUpstreamUrl,
  buildRequestProxyUpstreamUrl,
  buildScriptProxyUpstreamUrl,
  defineRequestProxyRegistry,
  getRequestProxyDefinition,
  isRequestProxyMethodAllowed,
  isRequestProxyUrlAllowed,
  proxySelectedScript,
} from "../../src/platform/scripts";
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

const testFlowCopy = {
  locale: "en",
  ui: {
    actions: {
      back: "Back",
      next: "Next",
      submit: "Submit",
      loading: "Submitting...",
    },
    progress: {
      stepCount: "Step {{current}} of {{total}}",
    },
    errorModal: {
      title: "Check this answer",
      closeLabel: "Got it",
    },
    errors: {
      requiredAnswer: "This answer is required.",
      invalidChoice: "Select a valid option.",
      invalidPhone: "Enter a valid United States phone number.",
      invalidAutocomplete: "Enter a valid answer.",
      unavailableQuestion: "This question is not available.",
      incompleteStep: "We could not complete this step.",
      checkpointSaveFailed: "We could not save this answer.",
      checkpointStepSaveFailed: "We could not save this step.",
      stepResolutionFailed: "We could not prepare this step.",
      submissionFailed: "We could not submit the form.",
      trustedFormCertFailed: "We could not prepare the consent certificate. Check your connection and try again.",
    },
    pages: {
      nativeSubmissionError: {
        title: "We could not submit the form",
        heading: "We could not submit the form.",
        fallbackMessage: "We could not submit the form.",
      },
    },
  },
  postSubmit: {
    slug: "thanks",
    title: "Thanks.",
    message: "We received your information.",
  },
} as const;

const unavailableContent = {
  locale: "es",
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
  ...testFlowCopy,
      contract: {
        context: z.object({
          areaCode: z.string(),
          areaName: z.string(),
        }),
        answers: z.object({
          choice_key: z.enum(["yes"]),
          first_name: z.string(),
          phone_number: z.string(),
          residence_state: z.string(),
        }),
        payload: z.object({
          marketState: z.string(),
          firstName: z.string(),
        }),
      },
      context: {
        areaCode: "XX",
        areaName: "Example Area",
      },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ context, answers }) => ({
          marketState: context.areaCode,
          firstName: answers.first_name,
        }),
      },
      page: { name: "Test Page" },
      steps: [
        step.choice({
          key: "choice_key",
          slug: "elige",
          label: "Elige",
          presentation: {
            chrome: "hidden",
          },
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
          review: {
            title: text("Consentimiento"),
            fields: [
              {
                name: "review_first_name",
                label: "Nombre",
                value: "Ana",
              },
            ],
          },
          consent: {
            title: text("Consentimiento"),
            disclosure: consentMd("Texto de consentimiento."),
          },
          substeps: {
            consent: {
              presentation: {
                chrome: "hidden_on_mobile",
              },
            },
          },
        }),
      ],
    });

    expect(flow.customVariables).toEqual({
      areaCode: "XX",
      areaName: "Example Area",
    });
    expect(flow.context).toEqual({
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
    expect(flow.steps[0]?.presentation).toEqual({ chrome: "hidden" });
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
        preloadAssets: "when_reachable",
        execute: "on_step_mount",
        requireReadyBefore: "consent_substep",
      },
      substeps: {
        consent: {
          presentation: { chrome: "hidden_on_mobile" },
        },
      },
    });
  });

  it("uses the selected-script proxy for TrustedForm regardless of delivery mode", () => {
    const flow = defineFormFlow({
      name: "Proxy Test",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({}),
        payload: z.object({}),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: () => ({}),
      },
      page: { name: "Page" },
      steps: [
        step.trustedFormConsent({
          key: "trustedform_consent",
          slug: "consentimiento",
          review: {
            title: text("Consentimiento"),
            fields: [
              {
                name: "trusted_form_grantor_phone",
                label: "Teléfono",
                value: "+16155551234",
                trustedForm: {
                  role: "consent-grantor-phone",
                },
              },
            ],
          },
          consent: {
            title: text("Consentimiento"),
            disclosure: consentMd("Texto de consentimiento."),
          },
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
        preloadAssets: "when_reachable",
        execute: "on_step_mount",
        requireReadyBefore: "consent_substep",
      },
    });
  });

  it("centralizes stable TrustedForm Certify settings in an authoring preset", () => {
    expect(trustedFormCertify()).toEqual({
      fieldName: "xxTrustedFormCertUrl",
      delivery: "main_thread",
      scriptProxyKey: "tfc",
      scriptBaseUrl: "/_instant/scripts/trustedform.com/tfc.js",
      preloadAssets: "when_reachable",
      execute: "on_step_mount",
      requireReadyBefore: "consent_substep",
      allowSubmitWithoutCert: true,
    });

    expect(trustedFormCertify({ delivery: "partytown", allowSubmitWithoutCert: false })).toEqual({
      fieldName: "xxTrustedFormCertUrl",
      delivery: "partytown",
      scriptProxyKey: "tfc",
      scriptBaseUrl: "/_instant/scripts/trustedform.com/tfc.js",
      preloadAssets: "when_reachable",
      execute: "on_step_mount",
      requireReadyBefore: "consent_substep",
      allowSubmitWithoutCert: false,
    });
  });

  it("centralizes GTM settings in an authoring preset", () => {
    expect(gtmContainerIdSchema.safeParse("GTM-ABC123").success).toBe(true);
    expect(gtmContainerIdSchema.safeParse("bad-ABC123").success).toBe(false);
    expect(metaTestEventCodeSchema.safeParse("TEST79368").success).toBe(true);
    expect(metaTestEventCodeSchema.safeParse("TEST-LOCAL_1").success).toBe(true);
    expect(metaTestEventCodeSchema.safeParse("").success).toBe(false);
    expect(metaTestEventCodeSchema.safeParse("LOCAL79368").success).toBe(false);

    expect(
      googleTagManager({
        containerId: "GTM-ABC123",
        delivery: "partytown",
        proxy: "first_party",
      }),
    ).toEqual({
      containerId: "GTM-ABC123",
      delivery: "partytown",
      proxy: "first_party",
      dataLayerName: "dataLayer",
      scriptProxyKey: "gtm",
      scriptBaseUrl: "/_instant/scripts/gtm.js",
      partytownLib: "/~partytown/",
      partytownScriptUrl: "/~partytown/partytown.js",
    });

    expect(() =>
      googleTagManager({
        containerId: "not-gtm" as never,
      }),
    ).toThrow("Expected a Google Tag Manager container ID");
  });

  it("validates GTM tracking config against the context contract", () => {
    expect(() =>
      defineFormFlow({
        name: "Tracking Test",
        status: "ACTIVE",
        ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string() }),
          answers: z.object({}),
          payload: z.object({}),
        },
        context: { areaCode: "TN" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: () => ({}),
        },
        page: { name: "Tracking Test" },
        tracking: ({ event }) => ({
          googleTagManager: googleTagManager({
            containerId: "GTM-ABC123",
          }),
          events: [
            event.formView({
              name: "tracking_test_view",
              includeContext: ["missing_context"] as never,
            }),
          ],
        }),
        steps: [],
      }),
    ).toThrow("tracking.events.formView.includeContext references unknown contract.context keys");
  });

  it("emits tracking events only when authored and honors step overrides", async () => {
    const baseInput = {
      name: "Tracking Event Test",
      status: "ACTIVE",
      ...testFlowCopy,
      contract: {
        context: z.object({ areaCode: z.string(), product: z.string() }),
        answers: z.object({ wants_quote: z.enum(["yes", "no"]) }),
        payload: z.object({ wantsQuote: z.string() }),
      },
      context: { areaCode: "TN", product: "auto_insurance" },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }: { answers: { wants_quote: string } }) => ({ wantsQuote: answers.wants_quote }),
      },
      page: { name: "Tracking Event Test" },
    } as const;

    const transportOnlyFlow = defineFormFlow({
      ...baseInput,
      tracking: {
        googleTagManager: googleTagManager({ containerId: "GTM-ABC123" }),
      },
      steps: [
        step.choice({
          key: "wants_quote",
          slug: "quote",
          label: "Do you want a quote?",
          options: [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ],
        }),
      ],
    });

    const transportOnlyHtml = await renderFormPage(transportOnlyFlow, { routeKey: "tracking_none" });
    expect(transportOnlyHtml).not.toContain("instant_form_view");
    expect(transportOnlyHtml).not.toContain("instant_form_step_view");

    const authoredFlow = defineFormFlow({
      ...baseInput,
      tracking: ({ event }) => ({
        googleTagManager: googleTagManager({ containerId: "GTM-ABC123" }),
        events: [
          event.formView({ name: "form_view", includeContext: ["areaCode"] }),
          event.stepView({ name: "step_view", includeStep: true }),
          event.stepAnswer({ name: "step_answer", includeStep: true }),
        ],
      }),
      steps: [
        step.choice({
          key: "wants_quote",
          slug: "quote",
          label: "Do you want a quote?",
          tracking: {
            stepView: { name: "quote_step_view" },
            stepAnswer: false,
            validationError: { name: "quote_validation_error", includeStep: true },
          },
          options: [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ],
        }),
      ],
    });

    const authoredHtml = await renderFormPage(authoredFlow, { routeKey: "tracking_authored" });
    expect(authoredHtml).toContain("form_view");
    expect(authoredHtml).toContain("step_view");
    expect(authoredHtml).toContain("quote_step_view");
    expect(authoredHtml).toContain("quote_validation_error");
    expect(authoredHtml).toContain('"stepAnswer":false');
    expect(authoredHtml).toContain('"context":{"areaCode":"TN"}');
    expect(authoredHtml).not.toContain('"context":{"areaCode":"TN","product":"auto_insurance"}');
  });

  it("builds Meta payloads with hashed user data only", () => {
    const flow = defineFormFlow({
      name: "Meta Tracking Test",
      status: "ACTIVE",
      ...testFlowCopy,
      contract: {
        context: z.object({ areaCode: z.string(), product: z.string() }),
        answers: z.object({
          first_name: z.string(),
          last_name: z.string(),
          phone_number: z.string(),
        }),
        payload: z.object({ phone: z.string() }),
      },
      context: { areaCode: "TN", product: "auto_insurance" },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }) => ({ phone: answers.phone_number }),
      },
      page: { name: "Meta Tracking Test" },
      tracking: ({ event }) => ({
        googleTagManager: googleTagManager({ containerId: "GTM-ABC123" }),
        events: [
          event.submitSuccess({
            name: "instant_form_submit_success",
            includeContext: ["areaCode"],
            meta: {
              pixelId: "1234567890",
              eventName: "Lead",
              eventId: ({ submission }) => submission.id,
              userData: ({ answers }) => ({
                ph: answers.phone_number,
                fn: answers.first_name,
                ln: answers.last_name,
              }),
              customData: ({ context }) => ({
                market_state: context.areaCode,
                content_name: context.product,
              }),
            },
          }),
        ],
      }),
      steps: [
        step.text({ key: "first_name", slug: "first-name", label: "First name", autocomplete: "given-name" }),
        step.text({ key: "last_name", slug: "last-name", label: "Last name", autocomplete: "family-name" }),
        step.phone({ key: "phone_number", slug: "phone", label: "Phone" }),
      ],
    });

    const validation = validateSubmission(
      flow,
      "meta_test",
      {
        answers: {
          first_name: "Ana",
          last_name: "Lopez",
          phone_number: "(615) 555-1234",
        },
      },
      "2026-05-23T00:00:00.000Z",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const payload = createLifecycleTrackingPayload({
      form: flow,
      routeKey: "meta_test",
      kind: "submitSuccess",
      submission: validation.payload,
      browserIds: {
        fbp: "fb.1.1.abc",
        fbc: "fb.1.1.click",
        fbclid: "click",
      },
      eventSourceUrl: "https://example.test/form",
    });

    expect(payload).toMatchObject({
      event: "instant_form_submit_success",
      route_key: "meta_test",
      context: { areaCode: "TN" },
      meta: {
        pixel_id: "1234567890",
        event_name: "Lead",
        event_id: "11111111-1111-4111-8111-111111111111",
        action_source: "website",
        event_source_url: "https://example.test/form",
        fbp: "fb.1.1.abc",
        fbc: "fb.1.1.click",
        fbclid: "click",
        custom_data: {
          market_state: "TN",
          content_name: "auto_insurance",
        },
        user_data: {
          ph: sha256Hex("16155551234"),
          fn: sha256Hex("ana"),
          ln: sha256Hex("lopez"),
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("6155551234");
    expect(JSON.stringify(payload)).not.toContain("Ana");
    expect(JSON.stringify(payload)).not.toContain("Lopez");
  });

  it("allows Meta mappings on stepAnswer and rejects unsupported Meta event kinds", () => {
    expect(() =>
      defineFormFlow({
        name: "Invalid Meta Event Test",
        status: "ACTIVE",
        ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string() }),
          answers: z.object({ wants_quote: z.enum(["yes", "no"]) }),
          payload: z.object({ wantsQuote: z.string() }),
        },
        context: { areaCode: "TN" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ answers }) => ({ wantsQuote: answers.wants_quote }),
        },
        page: { name: "Invalid Meta Event Test" },
        tracking: ({ event }) => ({
          googleTagManager: googleTagManager({ containerId: "GTM-ABC123" }),
          events: [
            event.stepView({
              name: "step_view",
              meta: {
                pixelId: "1234567890",
                eventName: "LeadProgress",
              },
            }),
          ],
        }),
        steps: [
          step.choice({
            key: "wants_quote",
            slug: "quote",
            label: "Do you want a quote?",
            options: [
              { key: "yes", label: "Yes" },
              { key: "no", label: "No" },
            ],
          }),
        ],
      }),
    ).toThrow("meta is only supported on submitSuccess, stepAnswer, and trustedFormSubstepView events");

    const flow = createMetaRemarketingTestFlow();
    const residenceStep = requireStep(flow, "residence_state");
    const payload = createLifecycleTrackingPayload({
      form: flow,
      routeKey: "meta_test",
      kind: "stepAnswer",
      step: residenceStep,
      stepIndex: 1,
      extra: { answer_key: "residence_state" },
      answers: {
        belongs_to_state: "no",
        residence_state: "TX",
        first_name: "Ana",
        last_name: "Lopez",
        phone_number: "+16155551234",
      },
      browserIds: {
        fbp: "fb.1.1.abc",
        fbc: "fb.1.1.click",
        fbclid: "click",
      },
      eventId: "progress-event-1",
      eventSourceUrl: "https://example.test/estado-donde-vive",
      requireMeta: true,
    });

    expect(payload).toMatchObject({
      event: "instant_form_step_answer",
      route_key: "meta_test",
      step_key: "residence_state",
      answer_key: "residence_state",
      meta: {
        pixel_id: "1234567890",
        event_name: "LeadProgress",
        event_id: "progress-event-1",
        action_source: "website",
        event_source_url: "https://example.test/estado-donde-vive",
        fbp: "fb.1.1.abc",
        fbc: "fb.1.1.click",
        fbclid: "click",
        custom_data: {
          content_name: "auto_insurance",
          content_category: "insurance",
          market_state: "TN",
          residence_state: "TX",
          belongs_to_state: "no",
          funnel_step: "residence_state",
        },
        user_data: {
          ph: sha256Hex("16155551234"),
          fn: sha256Hex("ana"),
          ln: sha256Hex("lopez"),
          st: sha256Hex("tx"),
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("6155551234");
    expect(JSON.stringify(payload)).not.toContain("Ana");
    expect(JSON.stringify(payload)).not.toContain("Lopez");
  });

  it("returns partial Meta remarketing events from validated checkpoints", async () => {
    const flow = createMetaRemarketingTestFlow();
    const routes = defineFormRoutes({
      index: redirectTo("/meta"),
      folders: {
        meta: flow,
      },
      notFound: unavailable(unavailableContent),
    });
    const app = new Hono();
    registerFormRoutes(app, routes, () => undefined);

    const response = await app.fetch(
      new Request("http://localhost/api/forms/meta/checkpoints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${getCheckpointCookieName("meta")}=${encodeCheckpointAnswers({ belongs_to_state: "no" })}`,
        },
        body: JSON.stringify({
          questionKey: "residence_state",
          answer: "Texas",
          tracking: {
            fbp: "fb.1.1.abc",
            fbc: "fb.1.1.click",
            fbclid: "click",
            eventSourceUrl: "https://example.test/meta/estado-donde-vive",
          },
        }),
      }),
    );
    const body = await response.json();
    const responseBody = body as {
      trackingEvents?: Array<{ meta?: { event_id?: unknown } } & Record<string, unknown>>;
    };
    const trackingEvent = responseBody.trackingEvents?.[0];

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      answers: {
        belongs_to_state: "no",
        residence_state: "TX",
      },
    });
    expect(trackingEvent).toMatchObject({
      event: "instant_form_step_answer",
      route_key: "meta",
      step_key: "residence_state",
      answer_key: "residence_state",
      meta: {
        pixel_id: "1234567890",
        event_name: "LeadProgress",
        action_source: "website",
        event_source_url: "https://example.test/meta/estado-donde-vive",
        custom_data: {
          residence_state: "TX",
          belongs_to_state: "no",
          funnel_step: "residence_state",
        },
        user_data: {
          st: sha256Hex("tx"),
        },
      },
    });
    expect(typeof trackingEvent?.meta?.event_id).toBe("string");
  });

  it("returns server-built Meta events for TrustedForm substep views", async () => {
    const handler = createFetchHandler();
    const savedAnswers = {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    };
    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/tracking-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createCheckpointCookie(savedAnswers),
        },
        body: JSON.stringify({
          eventKind: "trustedFormSubstepView",
          stepKey: "trustedform_consent",
          trustedFormSubstep: "review",
          answers: {},
          tracking: {
            fbp: "fb.1.1.abc",
            eventSourceUrl: "https://example.test/tn/custom/consentimiento",
          },
        }),
      }),
    );
    const body = await response.json();
    const responseBody = body as {
      trackingEvents?: Array<{ meta?: { event_id?: unknown } } & Record<string, unknown>>;
    };
    const trackingEvent = responseBody.trackingEvents?.[0];

    expect(response.status).toBe(200);
    expect(trackingEvent).toMatchObject({
      event: "instant_form_trusted_form_substep_view",
      route_key: "tn_custom",
      step_key: "trustedform_consent",
      trusted_form_substep: "review",
      meta: {
        pixel_id: "1465068051587670",
        event_name: "LeadProgress",
        action_source: "website",
        event_source_url: "https://example.test/tn/custom/consentimiento",
        fbp: "fb.1.1.abc",
        custom_data: {
          residence_state: "TN",
          funnel_step: "trustedform_consent",
          trusted_form_substep: "review",
        },
        user_data: {
          ph: sha256Hex("16155551234"),
          fn: sha256Hex("ana"),
          ln: sha256Hex("lopez"),
          st: sha256Hex("tn"),
        },
      },
    });
    expect(typeof trackingEvent?.meta?.event_id).toBe("string");
    expect(JSON.stringify(trackingEvent)).not.toContain("Ana");
    expect(JSON.stringify(trackingEvent)).not.toContain("Lopez");
    expect(JSON.stringify(trackingEvent)).not.toContain("6155551234");
  });

  it("injects a server-built initial Meta event on the TrustedForm consent route", async () => {
    const form = getRequiredTennesseeForm();
    const trustedFormStepIndex = form.steps.findIndex((stepDefinition) => stepDefinition.key === "trustedform_consent");
    const savedAnswers = {
      ...seenMatchingAnswers,
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    };
    const html = await renderTennesseeForm({
      activeStepIndex: trustedFormStepIndex,
      answers: savedAnswers,
    });
    const config = extractRenderedFormConfig(html);
    const trackingEvent = config.initialTrackingEvents?.[0];

    expect(trustedFormStepIndex).toBeGreaterThan(-1);
    expect(trackingEvent).toMatchObject({
      event: "instant_form_trusted_form_substep_view",
      route_key: "tn_custom",
      step_key: "trustedform_consent",
      trusted_form_substep: "review",
      meta: {
        pixel_id: "1465068051587670",
        event_name: "LeadProgress",
        custom_data: {
          residence_state: "TN",
          funnel_step: "trustedform_consent",
          trusted_form_substep: "review",
        },
        user_data: {
          ph: sha256Hex("16155551234"),
          fn: sha256Hex("ana"),
          ln: sha256Hex("lopez"),
          st: sha256Hex("tn"),
        },
      },
    });
    expect(typeof trackingEvent?.meta?.event_id).toBe("string");
    expect(JSON.stringify(trackingEvent)).not.toContain("Ana");
    expect(JSON.stringify(trackingEvent)).not.toContain("Lopez");
    expect(JSON.stringify(trackingEvent)).not.toContain("6155551234");
    expect(html).toContain("pushInitialClientTrackingEvents();");
  });

  it("adds optional Meta test event codes to template-authored Meta events", () => {
    const flow = createAutoInsuranceTemplateTestFlow("TEST79368");
    const residenceStep = flow.steps.find((stepDefinition) => stepDefinition.key === "residence_state");
    if (!residenceStep) {
      throw new Error("Expected auto insurance flow to include residence_state.");
    }

    const progressPayload = createLifecycleTrackingPayload({
      form: flow,
      routeKey: "template_test",
      kind: "stepAnswer",
      step: residenceStep,
      stepIndex: 1,
      extra: { answer_key: "residence_state" },
      answers: {
        belongs_to_state: "no",
        residence_state: "TX",
        first_name: "Ana",
        last_name: "Lopez",
        phone_number: "+16155551234",
      },
      eventId: "progress-event-1",
      eventSourceUrl: "https://example.test/state",
      requireMeta: true,
    });

    expect(progressPayload?.meta).toMatchObject({
      pixel_id: "1234567890",
      event_name: "LeadProgress",
      test_event_code: "TEST79368",
    });

    const validation = validateSubmission(
      flow,
      "template_test",
      {
        answers: {
          belongs_to_state: "yes",
          matching_offer: "seen",
          has_license: "yes",
          has_insurance: "yes",
          is_clean_title: "yes",
          number_of_registered_cars: "1",
          first_name: "Ana",
          last_name: "Lopez",
          phone_number: "+16155551234",
          trustedform_consent: "accepted",
        },
        trustedFormCertUrl,
      },
      "2026-05-23T00:00:00.000Z",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const leadPayload = createLifecycleTrackingPayload({
      form: flow,
      routeKey: "template_test",
      kind: "submitSuccess",
      submission: validation.payload,
      eventSourceUrl: "https://example.test/thanks",
      requireMeta: true,
    });

    expect(leadPayload?.meta).toMatchObject({
      pixel_id: "1234567890",
      event_name: "Lead",
      test_event_code: "TEST79368",
    });
    expect(JSON.stringify(leadPayload)).not.toContain("Ana");
    expect(JSON.stringify(leadPayload)).not.toContain("Lopez");
  });

  it("omits Meta test event codes when the template variable is unset and rejects malformed codes", () => {
    const flow = createAutoInsuranceTemplateTestFlow();
    const residenceStep = flow.steps.find((stepDefinition) => stepDefinition.key === "residence_state");
    if (!residenceStep) {
      throw new Error("Expected auto insurance flow to include residence_state.");
    }

    const payload = createLifecycleTrackingPayload({
      form: flow,
      routeKey: "template_test",
      kind: "stepAnswer",
      step: residenceStep,
      answers: {
        belongs_to_state: "no",
        residence_state: "TX",
      },
      requireMeta: true,
    });

    expect(payload?.meta).not.toHaveProperty("test_event_code");
    expect(() => createAutoInsuranceTemplateTestFlow("LOCAL79368")).toThrow("Expected a Meta test event code");
    expect(() => createAutoInsuranceTemplateTestFlow("")).toThrow("Expected a Meta test event code");
  });

  it("honors step-level disables for server-built partial remarketing events", () => {
    const flow = createMetaRemarketingTestFlow({ disableResidenceStepAnswer: true });
    const residenceStep = requireStep(flow, "residence_state");
    const payload = createLifecycleTrackingPayload({
      form: flow,
      routeKey: "meta_test",
      kind: "stepAnswer",
      step: residenceStep,
      stepIndex: 1,
      answers: { belongs_to_state: "no", residence_state: "TX" },
      eventId: "disabled-event",
      requireMeta: true,
    });

    expect(payload).toBeUndefined();
  });

  it("validates Zod flow contracts and resolves answer variables into delivery payloads", () => {
    const flow = defineFormFlow({
      name: "Contract Test",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({
          areaCode: z.string(),
          product: z.string(),
        }),
        answers: z.object({
          choice_key: z.enum(["yes"]),
        }),
        payload: z.object({
          marketState: z.string(),
          product: z.string(),
          selectedChoice: z.string(),
        }),
      },
      context: {
        areaCode: "TX",
        product: "home_insurance",
      },
      payload: {
        method: "POST",
        encoding: "form_urlencoded",
        mapping: ({ context, answers }) => ({
          marketState: context.areaCode,
          product: context.product,
          selectedChoice: answers.choice_key,
        }),
      },
      page: { name: "Page" },
      steps: [
        step.choice({
          key: "choice_key",
          slug: "elige",
          label: "Elige",
          options: [{ key: "yes", label: "Si" }],
        }),
      ],
    });

    const result = validateSubmission(flow, "test_route", { answers: { choice_key: "yes" } });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.delivery).toEqual({
        method: "POST",
        encoding: "form_urlencoded",
        payload: {
          marketState: "TX",
          product: "home_insurance",
          selectedChoice: "yes",
        },
      });
    }
  });

  it("rejects missing, invalid, undeclared, and unresolved context variables", () => {
    const baseStep = step.choice({
      key: "choice_key",
      slug: "elige",
      label: "Elige",
      options: [{ key: "yes", label: "Si" }],
    });

    expect(() =>
      defineFormFlow({
        name: "Missing Variable",
        status: "ACTIVE",
  ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string(), product: z.string() }),
          answers: z.object({ choice_key: z.enum(["yes"]) }),
          payload: z.object({ marketState: z.string() }),
        },
        context: { areaCode: "TX" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ context }: any) => ({ marketState: context.areaCode }),
        },
        page: { name: "Page" },
        steps: [baseStep],
      }),
    ).toThrow("context does not match the context contract");

    expect(() =>
      defineFormFlow({
        name: "Invalid Variable",
        status: "ACTIVE",
  ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string().min(2) }),
          answers: z.object({ choice_key: z.enum(["yes"]) }),
          payload: z.object({ marketState: z.string() }),
        },
        context: { areaCode: "T" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ context }: any) => ({ marketState: context.areaCode }),
        },
        page: { name: "Page" },
        steps: [baseStep],
      }),
    ).toThrow("context does not match the context contract");

    expect(() =>
      defineFormFlow({
        name: "Unknown Variable",
        status: "ACTIVE",
  ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string() }),
          answers: z.object({ choice_key: z.enum(["yes"]) }),
          payload: z.object({ marketState: z.string() }),
        },
        context: { areaCode: "TX", extraVariable: "nope" } as any,
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ context }: { context: { areaCode: string } }) => ({ marketState: context.areaCode }),
        },
        page: { name: "Page" },
        steps: [baseStep],
      }),
    ).toThrow("context includes undeclared keys");

    expect(() =>
      defineFormFlow({
        name: "Unknown Template",
        status: "ACTIVE",
  ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string() }),
          answers: z.object({}),
          payload: z.object({ marketState: z.string() }),
        },
        context: { areaCode: "TX" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ context }: { context: { areaCode: string } }) => ({ marketState: context.areaCode }),
        },
        page: { name: "Page" },
        steps: [
          step.interstitial({
            key: "matching_offer",
            slug: "buscando",
            label: "Buscando",
            successLines: [{ text: "Listo", color: "accent" }],
            benefits: ["Preparando {{missingVariable}}"],
          }),
        ],
      }),
    ).toThrow('Template variable "{{missingVariable}}" is not declared in contract.context');
  });

  it("rejects invalid page presentation desktop heights", () => {
    const createFlowWithDesktopHeight = (desktopHeightPx: unknown) =>
      defineFormFlow({
        name: "Invalid Page Presentation",
        status: "ACTIVE",
        ...testFlowCopy,
        contract: {
          context: z.object({}),
          answers: z.object({ choice_key: z.enum(["yes"]) }),
          payload: z.object({ choice: z.string() }),
        },
        context: {},
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ answers }) => ({ choice: answers.choice_key }),
        },
        page: {
          name: "Page",
          presentation: { desktopHeightPx } as any,
        },
        steps: [
          step.choice({
            key: "choice_key",
            slug: "elige",
            label: "Elige",
            options: [{ key: "yes", label: "Si" }],
          }),
        ],
      });

    expect(() => createFlowWithDesktopHeight(0)).toThrow(
      "page.presentation.desktopHeightPx must be a finite positive number.",
    );
    expect(() => createFlowWithDesktopHeight(-1)).toThrow(
      "page.presentation.desktopHeightPx must be a finite positive number.",
    );
    expect(() => createFlowWithDesktopHeight(Infinity)).toThrow(
      "page.presentation.desktopHeightPx must be a finite positive number.",
    );
    expect(() => createFlowWithDesktopHeight("780")).toThrow(
      "page.presentation.desktopHeightPx must be a finite positive number.",
    );
  });

  it("rejects invalid or colliding post-submit slugs", () => {
    const createFlowWithPostSubmitSlug = (slug: string) =>
      defineFormFlow({
        name: "Invalid Post Submit",
        status: "ACTIVE",
        ...testFlowCopy,
        postSubmit: {
          slug,
          title: "Thanks.",
          message: "We received your information.",
        },
        contract: {
          context: z.object({}),
          answers: z.object({ choice_key: z.enum(["yes"]) }),
          payload: z.object({ choice: z.string() }),
        },
        context: {},
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ answers }) => ({ choice: answers.choice_key }),
        },
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "choice_key",
            slug: "elige",
            label: "Elige",
            options: [{ key: "yes", label: "Si" }],
          }),
        ],
      });

    expect(() => createFlowWithPostSubmitSlug("Gracias")).toThrow(
      "postSubmit.slug must be a lowercase URL-safe slug.",
    );
    expect(() => createFlowWithPostSubmitSlug("not gracias")).toThrow(
      "postSubmit.slug must be a lowercase URL-safe slug.",
    );
    expect(() => createFlowWithPostSubmitSlug("api")).toThrow('postSubmit.slug "api" is reserved.');
    expect(() => createFlowWithPostSubmitSlug("elige")).toThrow('postSubmit.slug "elige" collides with a step slug.');
    expect(() => createFlowWithPostSubmitSlug("choice-key")).toThrow(
      'postSubmit.slug "choice-key" collides with a step slug.',
    );
  });

  it("rejects unsafe post-submit CTA config", () => {
    const createFlowWithPostSubmitCta = (cta: { label: string; href: string }) =>
      defineFormFlow({
        name: "Invalid Post Submit CTA",
        status: "ACTIVE",
        ...testFlowCopy,
        postSubmit: {
          slug: "thanks",
          title: "Thanks.",
          message: "We received your information.",
          cta,
        },
        contract: {
          context: z.object({}),
          answers: z.object({ choice_key: z.enum(["yes"]) }),
          payload: z.object({ choice: z.string() }),
        },
        context: {},
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ answers }) => ({ choice: answers.choice_key }),
        },
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "choice_key",
            slug: "elige",
            label: "Elige",
            options: [{ key: "yes", label: "Si" }],
          }),
        ],
      });

    expect(() => createFlowWithPostSubmitCta({ label: "", href: "/" })).toThrow(
      "postSubmit.cta.label is required when postSubmit.cta is provided.",
    );
    expect(() => createFlowWithPostSubmitCta({ label: "Done", href: "" })).toThrow(
      'postSubmit.cta.href must be a relative "/" URL or an "https://" URL.',
    );
    expect(() => createFlowWithPostSubmitCta({ label: "Done", href: "javascript:alert(1)" })).toThrow(
      'postSubmit.cta.href must be a relative "/" URL or an "https://" URL.',
    );
    expect(() => createFlowWithPostSubmitCta({ label: "Done", href: "//example.test" })).toThrow(
      'postSubmit.cta.href must be a relative "/" URL or an "https://" URL.',
    );
    expect(createFlowWithPostSubmitCta({ label: "Done", href: "/tn/custom" }).postSubmit.cta).toEqual({
      label: "Done",
      href: "/tn/custom",
    });
    expect(createFlowWithPostSubmitCta({ label: "Done", href: "https://example.test" }).postSubmit.cta).toEqual({
      label: "Done",
      href: "https://example.test",
    });
  });

  it("rejects answer-producing steps that do not match the answer contract", () => {
    expect(() =>
      defineFormFlow({
        name: "Unknown Answer Step",
        status: "ACTIVE",
  ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string() }),
          answers: z.object({ known_answer: z.string() }),
          payload: z.object({ marketState: z.string() }),
        },
        context: { areaCode: "TX" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ context }: { context: { areaCode: string } }) => ({ marketState: context.areaCode }),
        },
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "unknown_answer",
            slug: "elige",
            label: "Elige",
            options: [{ key: "yes", label: "Si" }],
          }),
        ],
      } as any),
    ).toThrow('Answer step key "unknown_answer" is not declared in contract.answers');

    expect(() =>
      defineFormFlow({
        name: "Missing Answer Step",
        status: "ACTIVE",
  ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string() }),
          answers: z.object({ missing_answer: z.string() }),
          payload: z.object({ marketState: z.string() }),
        },
        context: { areaCode: "TX" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ context }: { context: { areaCode: string } }) => ({ marketState: context.areaCode }),
        },
        page: { name: "Page" },
        steps: [
          step.interstitial({
            key: "matching_offer",
            slug: "buscando",
            label: "Buscando",
            successLines: [{ text: "Listo", color: "accent" }],
            benefits: ["Beneficio"],
          }),
        ],
      } as any),
    ).toThrow("contract.answers includes keys without answer-producing steps: missing_answer");

    expect(() =>
      defineFormFlow({
        name: "Duplicate Answer Step",
        status: "ACTIVE",
  ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string() }),
          answers: z.object({ duplicate_answer: z.enum(["yes"]) }),
          payload: z.object({ marketState: z.string() }),
        },
        context: { areaCode: "TX" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ context }) => ({ marketState: context.areaCode }),
        },
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "duplicate_answer",
            slug: "elige",
            label: "Elige",
            options: [{ key: "yes", label: "Si" }],
          }),
          step.choice({
            key: "duplicate_answer",
            slug: "elige-otra",
            label: "Elige otra",
            options: [{ key: "yes", label: "Si" }],
          }),
        ],
      }),
    ).toThrow('Answer step key "duplicate_answer" is provided more than once');
  });

  it("rejects choice options and showWhen conditions that drift from answer contracts", () => {
    const contract = {
      context: z.object({ areaCode: z.string() }),
      answers: z.object({
        belongs_to_state: z.enum(["yes", "no"]),
        first_name: z.string(),
      }),
      payload: z.object({ marketState: z.string() }),
    };
    const context = { areaCode: "TX" };
    const payload = {
      method: "POST" as const,
      encoding: "json" as const,
      mapping: ({ context }: { context: { areaCode: string } }) => ({ marketState: context.areaCode }),
    };
    const validChoice = step.choice({
      key: "belongs_to_state",
      slug: "vive",
      label: "Vive aqui?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    });
    const validText = step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      autocomplete: "given-name",
    });

    expect(() =>
      defineFormFlow({
        name: "Invalid Choice Options",
        status: "ACTIVE",
  ...testFlowCopy,
        contract,
        context,
        payload,
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "belongs_to_state",
            slug: "vive",
            label: "Vive aqui?",
            options: [
              { key: "yeas", label: "Si" },
              { key: "nao", label: "No" },
            ],
          }),
          validText,
        ],
      } as any),
    ).toThrow('Choice step "belongs_to_state" includes option keys outside contract.answers: yeas, nao');

    expect(() =>
      defineFormFlow({
        name: "Missing Choice Option",
        status: "ACTIVE",
  ...testFlowCopy,
        contract,
        context,
        payload,
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "belongs_to_state",
            slug: "vive",
            label: "Vive aqui?",
            options: [{ key: "yes", label: "Si" }],
          }),
          validText,
        ],
      } as any),
    ).toThrow('Choice step "belongs_to_state" is missing option keys from contract.answers: no');

    expect(() =>
      defineFormFlow({
        name: "Invalid ShowWhen Key",
        status: "ACTIVE",
  ...testFlowCopy,
        contract,
        context,
        payload,
        page: { name: "Page" },
        steps: [
          validChoice,
          step.text({
            key: "first_name",
            slug: "nombre",
            label: "Nombre",
            autocomplete: "given-name",
            showWhen: {
              questionKey: "belonegs_to_state",
              answer: "no",
            },
          }),
        ],
      } as any),
    ).toThrow('showWhen for step "first_name" references unknown contract.answers key "belonegs_to_state"');

    expect(() =>
      defineFormFlow({
        name: "Invalid ShowWhen Answer",
        status: "ACTIVE",
  ...testFlowCopy,
        contract,
        context,
        payload,
        page: { name: "Page" },
        steps: [
          validChoice,
          step.text({
            key: "first_name",
            slug: "nombre",
            label: "Nombre",
            autocomplete: "given-name",
            showWhen: {
              questionKey: "belongs_to_state",
              answer: "nreo",
            },
          }),
        ],
      } as any),
    ).toThrow('showWhen for step "first_name" uses answer "nreo" that does not match contract.answers.belongs_to_state');
  });

  it("rejects showWhen conditions that reference later answers", () => {
    expect(() =>
      defineFormFlow({
        name: "Forward ShowWhen",
        status: "ACTIVE",
  ...testFlowCopy,
        contract: {
          context: z.object({ areaCode: z.string() }),
          answers: z.object({
            belongs_to_state: z.enum(["yes", "no"]),
            residence_state: z.string().optional(),
            has_license: z.enum(["yes", "no"]),
          }),
          payload: z.object({ marketState: z.string() }),
        },
        context: { areaCode: "TX" },
        payload: {
          method: "POST",
          encoding: "json",
          mapping: ({ context }: { context: { areaCode: string } }) => ({ marketState: context.areaCode }),
        },
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "belongs_to_state",
            slug: "vive",
            label: "Vive aqui?",
            options: [
              { key: "yes", label: "Si" },
              { key: "no", label: "No" },
            ],
          }),
          step.autocomplete({
            key: "residence_state",
            slug: "estado",
            label: "Estado",
            autocomplete: "address-level1",
            source: autocompleteSource.usStates(),
            showWhen: {
              questionKey: "has_license",
              answer: "no",
            },
          }),
          step.choice({
            key: "has_license",
            slug: "licencia",
            label: "Tiene licencia?",
            options: [
              { key: "yes", label: "Si" },
              { key: "no", label: "No" },
            ],
          }),
        ],
      } as any),
    ).toThrow('showWhen for step "residence_state" references "has_license" before that answer is available');
  });

  it("validates dynamic resolver dependencies against upstream answer steps", () => {
    const contract = {
      context: z.object({ areaName: z.string() }),
      answers: z.object({
        first_answer: z.enum(["yes"]),
        second_answer: z.string(),
      }),
      payload: z.object({ first: z.string(), second: z.string() }),
    };
    const context = { areaName: "Tennessee" };
    const payload = {
      method: "POST" as const,
      encoding: "json" as const,
      mapping: ({ answers }: { answers: { first_answer: string; second_answer: string } }) => ({
        first: answers.first_answer,
        second: answers.second_answer,
      }),
    };

    const validFlow = defineFormFlow({
      name: "Resolver Flow",
      status: "ACTIVE",
  ...testFlowCopy,
      contract,
      context,
      payload,
      page: { name: "Page" },
      steps: [
        step.choice({
          key: "first_answer",
          slug: "primera",
          label: "Primera",
          options: [{ key: "yes", label: "Si" }],
        }),
        step.text({
          key: "second_answer",
          slug: "segunda",
          label: "Segunda",
          autocomplete: "off",
        }),
        step.interstitial(
          {
            key: "matching_offer",
            slug: "buscando",
            label: "Buscando",
            successLines: [{ text: "Listo", color: "accent" }],
          },
          ["first_answer", "second_answer"],
          ({ context, answers }) => ({
            benefits: [
              text(context.areaName ?? "Unknown", ": ", answers.first_answer),
              text(answers.second_answer),
            ],
          }),
        ),
      ],
    });

    expect(validFlow.steps[2]).toMatchObject({
      kind: "interstitial",
      checkpointMode: "checkpoint_only",
    });
    expect(getStepDynamicResolverDependencies(validFlow.steps[2]!)).toEqual(["first_answer", "second_answer"]);

    expect(() =>
      defineFormFlow({
        name: "Future Resolver",
        status: "ACTIVE",
  ...testFlowCopy,
        contract,
        context,
        payload,
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "first_answer",
            slug: "primera",
            label: "Primera",
            options: [{ key: "yes", label: "Si" }],
          }),
          step.interstitial(
            {
              key: "matching_offer",
              slug: "buscando",
              label: "Buscando",
              successLines: [{ text: "Listo", color: "accent" }],
            },
            ["second_answer"],
            ({ answers }) => ({ benefits: [text(answers.second_answer)] }),
          ),
          step.text({
            key: "second_answer",
            slug: "segunda",
            label: "Segunda",
            autocomplete: "off",
          }),
        ],
      } as any),
    ).toThrow('Resolver for step "matching_offer" references "second_answer" before that answer is available');

    expect(() =>
      defineFormFlow({
        name: "Unknown Resolver",
        status: "ACTIVE",
  ...testFlowCopy,
        contract,
        context,
        payload,
        page: { name: "Page" },
        steps: [
          step.choice({
            key: "first_answer",
            slug: "primera",
            label: "Primera",
            options: [{ key: "yes", label: "Si" }],
          }),
          step.text({
            key: "second_answer",
            slug: "segunda",
            label: "Segunda",
            autocomplete: "off",
          }),
          step.interstitial(
            {
              key: "matching_offer",
              slug: "buscando",
              label: "Buscando",
              successLines: [{ text: "Listo", color: "accent" }],
            },
            ["unknown_answer"],
            ({ answers }) => ({ benefits: [text(answers.unknown_answer)] }),
          ),
        ],
      } as any),
    ).toThrow('Resolver for step "matching_offer" references unknown contract.answers key "unknown_answer"');
  });

  it("resolves dynamic text values and rejects unsafe resolver output", async () => {
    const matchingFlow = defineFormFlow({
      name: "Safe Resolver Flow",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({ areaName: z.string().optional(), areaCode: z.string() }),
        answers: z.object({ first_answer: z.enum(["yes"]) }),
        payload: z.object({ first: z.string() }),
      },
      context: { areaCode: "TN", areaName: "Tennessee" },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }: { answers: { first_answer: string } }) => ({ first: answers.first_answer }),
      },
      page: { name: "Page" },
      steps: ({ step, text }) => [
        step.choice({
          key: "first_answer",
          slug: "primera",
          label: "Primera",
          options: [{ key: "yes", label: "Si" }],
        }),
        step.interstitial(
          {
            key: "matching_offer",
            slug: "buscando",
            label: "Buscando",
            successLines: [{ text: "Listo", color: "accent" }],
          },
          ["first_answer"],
          ({ context, answers }) => ({
            benefits: [
              text("Preparando opciones en ", context.areaName ?? context.areaCode),
              text("Respuesta: ", answers.first_answer),
            ],
          }),
        ),
      ],
    });

    const resolvedMatchingStep = resolveStepDynamicValues(matchingFlow, matchingFlow.steps[1]!, {
      first_answer: "yes",
    });

    expect(resolvedMatchingStep).toMatchObject({
      kind: "interstitial",
      benefits: ["Preparando opciones en Tennessee", "Respuesta: yes"],
    });

    const consentFlow = defineFormFlow({
      name: "Safe Summary Flow",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({
          first_name: z.string(),
          last_name: z.string(),
          phone_number: z.string(),
        }),
        payload: z.object({ phone: z.string() }),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }: { answers: { phone_number: string } }) => ({ phone: answers.phone_number }),
      },
      page: { name: "Page" },
      steps: ({ step, text, md, consentMd }) => [
        step.text({ key: "first_name", slug: "nombre", label: "Nombre", autocomplete: "given-name" }),
        step.text({ key: "last_name", slug: "apellido", label: "Apellido", autocomplete: "family-name" }),
        step.phone({ key: "phone_number", slug: "telefono", label: "Telefono" }),
        step.trustedFormConsent(
          {
            key: "trustedform_consent",
            slug: "consentimiento",
          },
          ["first_name", "last_name", "phone_number"],
          ({ answers }) => ({
            review: {
              title: text("Consentimiento"),
              fields: [
              {
                name: "trusted_form_grantor_name",
                label: "Nombre",
                value: text(answers.first_name, " ", answers.last_name),
                trustedForm: {
                  role: "consent-grantor-name",
                },
              },
              {
                name: "trusted_form_grantor_phone",
                label: "Teléfono",
                value: text(answers.phone_number),
                trustedForm: {
                  role: "consent-grantor-phone",
                },
              },
              ],
            },
            consent: {
              title: text("Consentimiento"),
              disclosure: consentMd("Texto de consentimiento."),
            },
          }),
        ),
      ],
    });

    const resolvedConsentStep = resolveStepDynamicValues(consentFlow, consentFlow.steps[3]!, {
      first_name: "Ana",
      last_name: "Lopez",
      phone_number: "+16155551234",
    });

    expect(resolvedConsentStep).toMatchObject({
      kind: "trusted_form_consent",
      review: {
        fields: [
          {
            name: "trusted_form_grantor_name",
            label: "Nombre",
            value: "Ana Lopez",
            trustedForm: {
              role: "consent-grantor-name",
            },
          },
          {
            name: "trusted_form_grantor_phone",
            label: "Teléfono",
            value: "+16155551234",
            trustedForm: {
              role: "consent-grantor-phone",
            },
          },
        ],
      },
    });

    const rawPhoneReviewHtml = await renderFormPage(consentFlow, {
      routeKey: "safe_summary",
      activeStepIndex: 3,
      answers: {
        first_name: "Ana",
        last_name: "Lopez",
        phone_number: "+16155551234",
      },
    });
    expect(rawPhoneReviewHtml).toContain(
      '<dd class="trusted-form-review-value" data-tf-element-role="consent-grantor-phone">+16155551234</dd>',
    );
    expect(rawPhoneReviewHtml).not.toContain(
      '<dd class="trusted-form-review-value" data-tf-element-role="consent-grantor-phone">(615) 555-1234</dd>',
    );

    const undefinedFlow = defineFormFlow({
      name: "Unsafe Resolver Flow",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({ first_answer: z.enum(["yes"]) }),
        payload: z.object({ first: z.string() }),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }: { answers: { first_answer: string } }) => ({ first: answers.first_answer }),
      },
      page: { name: "Page" },
      steps: [
        step.choice({
          key: "first_answer",
          slug: "primera",
          label: "Primera",
          options: [{ key: "yes", label: "Si" }],
        }),
        step.interstitial(
          {
            key: "matching_offer",
            slug: "buscando",
            label: "Buscando",
            successLines: [{ text: "Listo", color: "accent" }],
          },
          ["first_answer"],
          () => ({ benefits: [undefined as unknown as ReturnType<typeof text>] }),
        ),
      ],
    });

    expect(() =>
      resolveStepDynamicValues(undefinedFlow, undefinedFlow.steps[1]!, { first_answer: "yes" }),
    ).toThrow('Resolver for step "matching_offer".benefits[0] returned undefined');

    const unresolvedStringFlow = defineFormFlow({
      name: "Unsafe Text Resolver Flow",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({ first_answer: z.enum(["yes"]) }),
        payload: z.object({ first: z.string() }),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }: { answers: { first_answer: string } }) => ({ first: answers.first_answer }),
      },
      page: { name: "Page" },
      steps: [
        step.choice({
          key: "first_answer",
          slug: "primera",
          label: "Primera",
          options: [{ key: "yes", label: "Si" }],
        }),
        step.interstitial(
          {
            key: "matching_offer",
            slug: "buscando",
            label: "Buscando",
            successLines: [{ text: "Listo", color: "accent" }],
          },
          ["first_answer"],
          () => ({
            benefits: ["Preparando opciones en undefined" as unknown as ReturnType<typeof text>],
          }),
        ),
      ],
    });

    expect(() =>
      resolveStepDynamicValues(unresolvedStringFlow, unresolvedStringFlow.steps[1]!, { first_answer: "yes" }),
    ).toThrow('Resolver for step "matching_offer".benefits[0] returned unresolved text');

    const staticFieldFlow = defineFormFlow({
      name: "Static Field Resolver Flow",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({ first_answer: z.enum(["yes"]) }),
        payload: z.object({ first: z.string() }),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }: { answers: { first_answer: string } }) => ({ first: answers.first_answer }),
      },
      page: { name: "Page" },
      steps: [
        step.choice({
          key: "first_answer",
          slug: "primera",
          label: "Primera",
          options: [{ key: "yes", label: "Si" }],
        }),
        step.interstitial(
          {
            key: "matching_offer",
            slug: "buscando",
            label: "Buscando",
            successLines: [{ text: "Listo", color: "accent" }],
          },
          ["first_answer"],
          () =>
            ({
              key: "other_key",
              benefits: [text("Listo")],
            }) as any,
        ),
      ],
    });

    expect(() =>
      resolveStepDynamicValues(staticFieldFlow, staticFieldFlow.steps[1]!, { first_answer: "yes" }),
    ).toThrow('Resolver for step "matching_offer" cannot return static step fields. Unknown fields: key.');
  });

  it("validates mapped delivery payloads against the payload contract", () => {
    const flow = defineFormFlow({
      name: "Payload Contract",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({ areaCode: z.string() }),
        answers: z.object({ choice_key: z.enum(["yes"]) }),
        payload: z.object({ marketState: z.string().min(2) }),
      },
      context: { areaCode: "TX" },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: () =>
          ({
            marketState: "",
            extra: "nope",
          }) as any,
      },
      page: { name: "Page" },
      steps: [
        step.choice({
          key: "choice_key",
          slug: "elige",
          label: "Elige",
          options: [{ key: "yes", label: "Si" }],
        }),
      ],
    });

    const result = validateSubmission(flow, "test_route", { answers: { choice_key: "yes" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "delivery.payload",
        message: "Delivery payload includes undeclared keys: extra.",
      });
    }
  });
});

describe("repository structure", () => {
  const requiredReadmes = [
    "README.md",
    "src/README.md",
    "src/authoring/README.md",
    "src/authoring/flows/README.md",
    "src/authoring/flows/tn/README.md",
    "src/authoring/proxies/README.md",
    "src/authoring/routes/README.md",
    "src/authoring/scripts/README.md",
    "src/authoring/templates/README.md",
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

describe("form templates", () => {
  const createReusableTemplate = () =>
    defineFormTemplate({
      variables: z.object({
        flowName: z.string(),
        areaCode: z.string().min(2),
        areaName: z.string().optional(),
      }),
      create: ({ variables }) =>
        defineFormFlow({
          name: variables.flowName,
          status: "ACTIVE",
          ...testFlowCopy,
          contract: {
            context: z.object({
              areaCode: z.string(),
              areaName: z.string().optional(),
            }),
            answers: z.object({}),
            payload: z.object({ marketState: z.string(), marketName: z.string() }),
          },
          context: {
            areaCode: variables.areaCode,
            areaName: variables.areaName,
          },
          payload: {
            method: "POST",
            encoding: "json",
            mapping: ({ context }) => ({
              marketState: context.areaCode,
              marketName: context.areaName ?? context.areaCode,
            }),
          },
          page: {
            name: variables.flowName,
          },
          steps: [],
        }),
    });

  it("creates normal flows from validated template variables", () => {
    const template = createReusableTemplate();
    const flow = template.create({ flowName: "Reusable TX", areaCode: "TX" });
    const flowWithOptionalVariable = template.create({
      flowName: "Reusable CA",
      areaCode: "CA",
      areaName: "California",
    });

    expect(flow.name).toBe("Reusable TX");
    expect(flow.customVariables).toEqual({ areaCode: "TX" });
    expect(flow.steps).toEqual([]);
    expect(flowWithOptionalVariable.customVariables).toEqual({
      areaCode: "CA",
      areaName: "California",
    });
  });

  it("rejects missing, unknown, and invalid template variables", () => {
    const template = createReusableTemplate();

    expect(() => template.create({ areaCode: "TX" } as any)).toThrow(
      "template variables do not match the template contract",
    );
    expect(() =>
      template.create({
        flowName: "Reusable TX",
        areaCode: "TX",
        extraVariable: "nope",
      } as any),
    ).toThrow("template variables include undeclared keys: extraVariable");
    expect(() => template.create({ flowName: "Reusable T", areaCode: "T" })).toThrow(
      "template variables do not match the template contract",
    );
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
        message: "Esta respuesta es requerida.",
      });
    }
  });

  it("rejects invalid choice option keys", () => {
    const result = validateSubmission(form, routeKey, { answers: { ...validAnswers, belongs_to_state: "maybe" } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        field: "belongs_to_state",
        message: "Seleccione una opción válida.",
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
      expect(result.payload.delivery).toEqual({
        method: "POST",
        encoding: "json",
        payload: {
          marketState: "TN",
          marketName: "Tennessee",
          product: "auto_insurance",
          phone: "+16155551234",
        },
      });
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
        message: "Esta respuesta es requerida.",
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
        message: "No pudimos preparar el certificado de consentimiento. Revise su conexión e intente de nuevo.",
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
        message: "No pudimos preparar el certificado de consentimiento. Revise su conexión e intente de nuevo.",
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
  it("registers Google Tag Manager as an allowlisted selected script", () => {
    const gtmScript = selectedScripts.gtm;
    if (!gtmScript) {
      throw new Error("Expected selectedScripts.gtm to be registered.");
    }

    expect(gtmScript.key).toBe("gtm");
    expect(gtmScript.upstreamUrl).toBe("https://www.googletagmanager.com/gtm.js");
    expect(gtmScript.allowedQueryParams).toEqual([
      "id",
      "l",
      "gtm_auth",
      "gtm_preview",
      "gtm_cookies_win",
    ]);

    const result = buildScriptProxyUpstreamUrl(
      gtmScript,
      new URL("http://localhost/_instant/scripts/gtm.js?id=GTM-ABC123&l=dataLayer"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.toString()).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-ABC123&l=dataLayer");
    }
  });

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

describe("request proxy registry", () => {
  it("registers the authored follow-up request proxies", () => {
    const trustedForm = getRequestProxyDefinition(requestProxies, "trustedForm");
    const googleTags = getRequestProxyDefinition(requestProxies, "googleTags");
    const metaPixel = getRequestProxyDefinition(requestProxies, "metaPixel");

    expect(trustedForm?.route).toBe("/_instant/trustedform/proxy");
    expect(googleTags?.route).toBe("/_instant/google-tags/proxy");
    expect(metaPixel?.route).toBe("/_instant/meta/proxy");
    expect(metaPixel?.specialRoutes).toContainEqual({
      route: "/_instant/meta/tr",
      upstreamOrigin: "https://www.facebook.com",
      upstreamPath: "/tr",
    });
  });

  it("validates request proxy allowlists, methods, and static routes", () => {
    const googleTags = getRequestProxyDefinition(requestProxies, "googleTags");
    const metaPixel = getRequestProxyDefinition(requestProxies, "metaPixel");
    if (!googleTags || !metaPixel) {
      throw new Error("Expected authored request proxies to be registered.");
    }

    expect(isRequestProxyUrlAllowed(googleTags, new URL("https://www.googletagmanager.com/debug/bootstrap"))).toBe(
      true,
    );
    expect(isRequestProxyUrlAllowed(googleTags, new URL("https://evil.test/debug/bootstrap"))).toBe(false);
    expect(isRequestProxyUrlAllowed(metaPixel, new URL("https://www.facebook.com/tr?id=123&ev=Lead"))).toBe(true);
    expect(isRequestProxyUrlAllowed(metaPixel, new URL("https://www.facebook.com/plugins/like.php"))).toBe(false);
    expect(isRequestProxyMethodAllowed(metaPixel, "POST")).toBe(true);
    expect(isRequestProxyMethodAllowed(metaPixel, "DELETE")).toBe(false);
  });

  it("builds request proxy upstream URLs from registry definitions", () => {
    const trustedForm = getRequestProxyDefinition(requestProxies, "trustedForm");
    const metaPixel = getRequestProxyDefinition(requestProxies, "metaPixel");
    const specialRoute = metaPixel?.specialRoutes?.[0];
    if (!trustedForm || !metaPixel || !specialRoute) {
      throw new Error("Expected authored request proxies to be registered.");
    }

    const result = buildRequestProxyUpstreamUrl(
      trustedForm,
      new URL(
        `http://localhost/_instant/trustedform/proxy?u=${encodeURIComponent("https://events.trustedform.com/v1/beacon")}`,
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.toString()).toBe("https://events.trustedform.com/v1/beacon");
    }

    const specialResult = buildRequestProxySpecialRouteUpstreamUrl(
      metaPixel,
      specialRoute,
      new URL("http://localhost/_instant/meta/tr/?id=123&ev=Lead"),
    );
    expect(specialResult.ok).toBe(true);
    if (specialResult.ok) {
      expect(specialResult.url.toString()).toBe("https://www.facebook.com/tr/?id=123&ev=Lead");
    }
  });

  it("rejects unsafe request proxy definitions", () => {
    expect(() =>
      defineRequestProxyRegistry({
        unsafe: {
          route: "https://evil.test/proxy",
          allowedMethods: ["GET"],
          timeoutMs: 1000,
          allow: [{ protocol: "https:", hostname: "example.com" }],
          clientRewrite: { kind: "query_param", param: "u" },
        },
      }),
    ).toThrow("route must be a static absolute route");

    expect(() =>
      defineRequestProxyRegistry({
        unsafe: {
          route: "/_instant/unsafe/proxy",
          allowedMethods: ["DELETE" as "GET"],
          timeoutMs: 1000,
          allow: [{ protocol: "https:", hostname: "example.com" }],
          clientRewrite: { kind: "query_param", param: "u" },
        },
      }),
    ).toThrow('method "DELETE" is not supported');

    expect(() =>
      defineRequestProxyRegistry({
        unsafe: {
          route: "/_instant/unsafe/proxy",
          allowedMethods: ["GET"],
          timeoutMs: 0,
          allow: [{ protocol: "https:", hostname: "example.com" }],
          clientRewrite: { kind: "query_param", param: "u" },
        },
      }),
    ).toThrow("timeoutMs must be a finite positive number");
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
      expect(response.headers.get("Cache-Control")).toBe("private, max-age=300, no-transform");
      expect(response.headers.get("Content-Length")).toBe(String(new TextEncoder().encode(body).byteLength));
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(body).toContain("__trustedFormProxyLoaded");
      expect(fetchedUrl).toBe(
        "https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&use_tagged_consent=true",
      );
      expect(fetchedHeaders?.get("Cookie")).toBeNull();

      const gtmResponse = await proxySelectedScript(
        new Request("http://localhost/_instant/scripts/gtm.js?id=GTM-ABC123&l=dataLayer", {
          headers: {
            Cookie: "private=value",
          },
        }),
        registry,
        "gtm",
      );

      expect(gtmResponse.status).toBe(200);
      expect(gtmResponse.headers.get("Cache-Control")).toBe("private, max-age=300, no-transform");
      expect(fetchedUrl).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-ABC123&l=dataLayer");
      expect(fetchedHeaders?.get("Cookie")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies TrustedForm event requests through an allowlisted first-party route", async () => {
    const originalFetch = globalThis.fetch;
    const handler = createFetchHandler();
    let fetchedUrl = "";
    let fetchedHeaders: Headers | undefined;

    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      fetchedUrl = input instanceof Request ? input.url : String(input);
      fetchedHeaders = new Headers(init?.headers);

      return Promise.resolve(
        new Response("ok", {
          headers: { "Content-Type": "text/plain" },
        }),
      );
    }) as typeof fetch;

    try {
      const target = encodeURIComponent("https://events.trustedform.com/v1/beacon?event=submitted");
      const response = await handler(
        new Request(`http://localhost/_instant/trustedform/proxy?u=${target}`, {
          headers: {
            Accept: "text/plain",
            Cookie: "private=value",
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(fetchedUrl).toBe("https://events.trustedform.com/v1/beacon?event=submitted");
      expect(fetchedHeaders?.get("Accept")).toBe("text/plain");
      expect(fetchedHeaders?.get("Cookie")).toBeNull();

      const rejectedResponse = await handler(
        new Request(
          `http://localhost/_instant/trustedform/proxy?u=${encodeURIComponent(
            "https://static.cloudflareinsights.com/beacon.min.js",
          )}`,
        ),
      );
      expect(rejectedResponse.status).toBe(400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies Google tag requests through an allowlisted first-party route", async () => {
    const originalFetch = globalThis.fetch;
    const handler = createFetchHandler();
    let fetchedUrl = "";
    let fetchedHeaders: Headers | undefined;

    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      fetchedUrl = input instanceof Request ? input.url : String(input);
      fetchedHeaders = new Headers(init?.headers);

      return Promise.resolve(
        new Response("ok", {
          headers: { "Content-Type": "text/plain" },
        }),
      );
    }) as typeof fetch;

    try {
      const target = encodeURIComponent("https://www.google-analytics.com/g/collect?v=2&en=page_view");
      const response = await handler(
        new Request(`http://localhost/_instant/google-tags/proxy?u=${target}`, {
          headers: {
            Accept: "text/plain",
            Cookie: "private=value",
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(fetchedUrl).toBe("https://www.google-analytics.com/g/collect?v=2&en=page_view");
      expect(fetchedHeaders?.get("Accept")).toBe("text/plain");
      expect(fetchedHeaders?.get("Cookie")).toBeNull();

      const debugBootstrapTarget = encodeURIComponent(
        "https://www.googletagmanager.com/debug/bootstrap?id=GTM-ABC123&src=GTM&cond=3&gtm=45He65k1v9253286226za204",
      );
      const debugBootstrapResponse = await handler(
        new Request(`http://localhost/_instant/google-tags/proxy?u=${debugBootstrapTarget}`),
      );

      expect(debugBootstrapResponse.status).toBe(200);
      expect(await debugBootstrapResponse.text()).toBe("ok");
      expect(fetchedUrl).toBe(
        "https://www.googletagmanager.com/debug/bootstrap?id=GTM-ABC123&src=GTM&cond=3&gtm=45He65k1v9253286226za204",
      );

      const analyticsDebugBootstrapTarget = encodeURIComponent(
        "https://www.google-analytics.com/debug/bootstrap?id=G-ABC123&src=GTM",
      );
      const analyticsDebugBootstrapResponse = await handler(
        new Request(`http://localhost/_instant/google-tags/proxy?u=${analyticsDebugBootstrapTarget}`),
      );

      expect(analyticsDebugBootstrapResponse.status).toBe(200);
      expect(await analyticsDebugBootstrapResponse.text()).toBe("ok");
      expect(fetchedUrl).toBe("https://www.google-analytics.com/debug/bootstrap?id=G-ABC123&src=GTM");

      const rejectedResponse = await handler(
        new Request(`http://localhost/_instant/google-tags/proxy?u=${encodeURIComponent("https://evil.test/pixel")}`),
      );
      expect(rejectedResponse.status).toBe(400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies Meta Pixel requests through an allowlisted first-party route", async () => {
    const originalFetch = globalThis.fetch;
    const handler = createFetchHandler();
    let fetchedUrl = "";
    let fetchedHeaders: Headers | undefined;

    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      fetchedUrl = input instanceof Request ? input.url : String(input);
      fetchedHeaders = new Headers(init?.headers);
      const body =
        fetchedUrl === "https://connect.facebook.net/en_US/fbevents.js"
          ? 'new Image().src="https://www.facebook.com/tr/?id=1234567890&ev=Lead";'
          : "ok";
      const contentType =
        fetchedUrl === "https://connect.facebook.net/en_US/fbevents.js" ? "application/javascript" : "text/plain";

      return Promise.resolve(
        new Response(body, {
          headers: { "Content-Type": contentType },
        }),
      );
    }) as typeof fetch;

    try {
      const scriptTarget = encodeURIComponent("https://connect.facebook.net/en_US/fbevents.js");
      const scriptResponse = await handler(
        new Request(`http://localhost/_instant/meta/proxy?u=${scriptTarget}`, {
          headers: {
            Accept: "text/plain",
            Cookie: "private=value",
          },
        }),
      );

      expect(scriptResponse.status).toBe(200);
      expect(await scriptResponse.text()).toBe('new Image().src="/_instant/meta/tr/?id=1234567890&ev=Lead";');
      expect(scriptResponse.headers.get("Cache-Control")).toBe("no-store");
      expect(fetchedUrl).toBe("https://connect.facebook.net/en_US/fbevents.js");
      expect(fetchedHeaders?.get("Accept")).toBe("text/plain");
      expect(fetchedHeaders?.get("Cookie")).toBeNull();

      const eventTarget = encodeURIComponent("https://www.facebook.com/tr?id=1234567890&ev=Lead&noscript=1");
      const eventResponse = await handler(new Request(`http://localhost/_instant/meta/proxy?u=${eventTarget}`));

      expect(eventResponse.status).toBe(200);
      expect(await eventResponse.text()).toBe("ok");
      expect(fetchedUrl).toBe("https://www.facebook.com/tr?id=1234567890&ev=Lead&noscript=1");

      const beaconResponse = await handler(new Request("http://localhost/_instant/meta/tr/?id=1234567890&ev=Lead"));

      expect(beaconResponse.status).toBe(200);
      expect(await beaconResponse.text()).toBe("ok");
      expect(fetchedUrl).toBe("https://www.facebook.com/tr/?id=1234567890&ev=Lead");

      const rejectedResponse = await handler(
        new Request(`http://localhost/_instant/meta/proxy?u=${encodeURIComponent("https://evil.test/pixel")}`),
      );
      expect(rejectedResponse.status).toBe(400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes nested selected-script proxy URLs through their script key", async () => {
    const app = new Hono();
    registerScriptRoutes(app, getBunFetchSelectedScriptRegistry(), requestProxies);
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
      expect(response.headers.get("Cache-Control")).toBe("private, max-age=300, no-transform");
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
      expect(response.headers.get("Cache-Control")).toBe("private, max-age=300, no-transform");
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
      nextStep: {
        key: "trustedform_consent",
        url: "/tn/custom/consentimiento",
        config: {
          kind: "trusted_form_consent",
          dynamicResolverDependencies: [
            "belongs_to_state",
            "residence_state",
            "has_license",
            "has_insurance",
            "is_clean_title",
            "number_of_registered_cars",
            "first_name",
            "last_name",
            "phone_number",
          ],
          review: {
            fields: [
              {
                name: "review_belongs_to_state",
                label: "Vive en Tennessee",
                value: "Sí",
              },
              {
                name: "review_residence_state",
                label: "Estado",
                value: "Tennessee",
              },
              {
                name: "review_has_license",
                label: "Licencia de EE. UU.",
                value: "Sí",
              },
              {
                name: "review_has_insurance",
                label: "Seguro actual",
                value: "No",
              },
              {
                name: "review_is_clean_title",
                label: "Título limpio",
                value: "Sí",
              },
              {
                name: "review_number_of_registered_cars",
                label: "Autos a asegurar",
                value: "1",
              },
              {
                name: "trusted_form_grantor_name",
                label: "Nombre completo",
                value: "Ana Lopez",
                trustedForm: {
                  role: "consent-grantor-name",
                },
              },
              {
                name: "trusted_form_grantor_phone",
                label: "Teléfono",
                value: "(615) 555-1234",
                trustedForm: {
                  role: "consent-grantor-phone",
                },
              },
            ],
          },
        },
      },
    });
  });

  it("resolves dynamic step payloads without mutating checkpoint cookies", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepKey: "trustedform_consent",
          answers: preConsentAnswers,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(body).toMatchObject({
      ok: true,
      step: {
        key: "trustedform_consent",
        url: "/tn/custom/consentimiento",
        config: {
          kind: "trusted_form_consent",
          dynamicResolverDependencies: [
            "belongs_to_state",
            "residence_state",
            "has_license",
            "has_insurance",
            "is_clean_title",
            "number_of_registered_cars",
            "first_name",
            "last_name",
            "phone_number",
          ],
          review: {
            fields: [
              {
                name: "review_belongs_to_state",
                label: "Vive en Tennessee",
                value: "Sí",
              },
              {
                name: "review_residence_state",
                label: "Estado",
                value: "Tennessee",
              },
              {
                name: "review_has_license",
                label: "Licencia de EE. UU.",
                value: "Sí",
              },
              {
                name: "review_has_insurance",
                label: "Seguro actual",
                value: "No",
              },
              {
                name: "review_is_clean_title",
                label: "Título limpio",
                value: "Sí",
              },
              {
                name: "review_number_of_registered_cars",
                label: "Autos a asegurar",
                value: "1",
              },
              {
                name: "trusted_form_grantor_name",
                label: "Nombre completo",
                value: "Ana Lopez",
                trustedForm: {
                  role: "consent-grantor-name",
                },
              },
              {
                name: "trusted_form_grantor_phone",
                label: "Teléfono",
                value: "(615) 555-1234",
                trustedForm: {
                  role: "consent-grantor-phone",
                },
              },
            ],
          },
        },
      },
    });
    const resolvedStep = (body as { step: { html: string } }).step;
    expect(resolvedStep.html).toContain("Ana Lopez");
    expect(resolvedStep.html).toContain("(615) 555-1234");
  });

  it("treats too-early dynamic resolution preloads as not-ready responses", async () => {
    const handler = createFetchHandler();
    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepKey: "trustedform_consent",
          answers: {
            ...preContactAnswers,
            first_name: "Ana",
            last_name: "Lopez",
            phone_number: "(615) 555-1234",
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ ok: false, reason: "step_not_ready" });
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
    await expect(invalidChoice.text()).resolves.toContain("Seleccione una opción válida.");
    expect(invalidPhone.status).toBe(400);
    await expect(invalidPhone.text()).resolves.toContain("Ingrese un número de teléfono válido de Estados Unidos.");
    expect(invalidState.status).toBe(400);
    await expect(invalidState.text()).resolves.toContain("Ingrese un estado válido de Estados Unidos.");
    expect(hiddenState.status).toBe(400);
    await expect(hiddenState.text()).resolves.toContain("Esta pregunta no está disponible.");
    expect(invalidMatching.status).toBe(400);
    await expect(invalidMatching.text()).resolves.toContain("No pudimos completar este paso.");
    expect(prematureSeenMatching.status).toBe(400);
    await expect(prematureSeenMatching.text()).resolves.toContain("No pudimos completar este paso.");
    expect(tooEarlyMatching.status).toBe(400);
    await expect(tooEarlyMatching.text()).resolves.toContain("Esta pregunta no está disponible.");
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
      delivery: {
        method: "POST",
        encoding: "json",
        payload: {
          marketState: "TN",
          marketName: "Tennessee",
          product: "auto_insurance",
          phone: "+16155551234",
        },
      },
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

  it("accepts native TrustedForm form submissions and redirects to a one-time post-submit page", async () => {
    const logs: unknown[] = [];
    const handler = createFetchHandler({ logger: (payload) => logs.push(payload) });
    const body = new URLSearchParams();
    Object.entries(validAnswers).forEach(([key, value]) => {
      body.set(`answers[${key}]`, value);
    });
    body.set("trustedFormCertUrl", trustedFormCertUrl);
    body.set("xxTrustedFormCertUrl", trustedFormCertUrl);
    body.set("tracking[fbp]", "fb.1.1.abc");
    body.set("tracking[eventSourceUrl]", "https://example.test/tn/custom/consentimiento");

    const response = await handler(
      new Request("http://localhost/api/forms/tn_custom/native-submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: createCheckpointCookie(validAnswers),
        },
        body,
      }),
    );
    const setCookie = response.headers.get("Set-Cookie") ?? "";
    const postSubmitCookie = getPostSubmitCookie(setCookie);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/tn/custom/gracias");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("instant_forms_tn_custom_post_submit=");
    expect(postSubmitCookie).toStartWith("instant_forms_tn_custom_post_submit=");
    const postSubmitResponse = await handler(
      new Request("http://localhost/tn/custom/gracias", {
        headers: {
          Cookie: postSubmitCookie,
        },
      }),
    );
    const html = await postSubmitResponse.text();

    expect(postSubmitResponse.status).toBe(200);
    expect(postSubmitResponse.headers.get("Content-Type")).toContain("text/html");
    expect(postSubmitResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(postSubmitResponse.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(html).toContain('<form class="form-panel" id="lead-form"');
    expect(html).toContain('data-form-view="post-submit"');
    expect(html).toContain('<img class="brand-logo"');
    expect(html).toContain('class="area-pill">TN</span>');
    expect(html).toContain("Paso");
    expect(html).toContain('style="width: 100%"');
    expect(html).toContain("Gracias.");
    expect(html).toContain("Recibimos su información. Un agente se pondrá en contacto con usted pronto.");
    expect(html).not.toContain('id="back-button"');
    expect(html).not.toContain('id="next-button"');
    expect(html).not.toContain('window.__FORM_CONFIG__');
    expect(html).toContain("instant_form_submit_success");
    expect(html).toContain('"event_name":"Lead"');
    expect(html).toContain('"pixel_id":"1465068051587670"');
    expect(html).toContain('"fbp":"fb.1.1.abc"');
    expect(html).toContain('document.addEventListener("pt0", pushInstantInitialTrackingEvents');
    expect(html).not.toContain("Ana");
    expect(html).not.toContain("Lopez");
    expect(html).not.toContain("+16155551234");
    const repeatedPostSubmitResponse = await handler(new Request("http://localhost/tn/custom/gracias"));

    expect(repeatedPostSubmitResponse.status).toBe(302);
    expect(repeatedPostSubmitResponse.headers.get("Location")).toBe("/tn/custom");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      routeKey: "tn_custom",
      trustedFormCertUrl,
      answers: {
        phone_number: "+16155551234",
      },
    });
  });
});

describe("form rendering", () => {
  it("renders per-flow English UI copy without platform Spanish defaults", async () => {
    const flow = defineFormFlow({
      name: "English Fixture",
      status: "ACTIVE",
      ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({
          wants_quote: z.enum(["yes", "no"]),
        }),
        payload: z.object({
          wantsQuote: z.string(),
        }),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }) => ({
          wantsQuote: answers.wants_quote,
        }),
      },
      page: {
        name: "English Form",
      },
      steps: [
        step.choice({
          key: "wants_quote",
          slug: "quote",
          label: "Do you want a quote?",
          options: [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ],
        }),
      ],
    });

    const html = await renderFormPage(flow, { routeKey: "en_custom" });
    const missingSubmission = validateSubmission(flow, "en_custom", { answers: {} });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Step 1 of 1");
    expect(html).toContain(">Back</button>");
    expect(html).toContain(">Submit</button>");
    expect(html).toContain("Check this answer");
    expect(html).toContain("Got it");
    expect(html).toContain("<h1>Thanks.</h1>");
    expect(html).toContain("<p>We received your information.</p>");
    expect(html).toContain('"requiredAnswer":"This answer is required."');
    expect(html).not.toContain("Revise esta respuesta");
    expect(html).not.toContain("Entendido");

    expect(missingSubmission.ok).toBe(false);
    if (!missingSubmission.ok) {
      expect(missingSubmission.errors).toContainEqual({
        field: "wants_quote",
        message: "This answer is required.",
      });
    }
  });

  it("renders post-submit pages in the shared form shell with an optional CTA", async () => {
    const flow = defineFormFlow({
      name: "Post Submit Fixture",
      status: "ACTIVE",
      ...testFlowCopy,
      postSubmit: {
        slug: "done",
        title: "Done.",
        message: "We received your form.",
        cta: {
          label: "Start over",
          href: "/tn/custom",
        },
      },
      contract: {
        context: z.object({}),
        answers: z.object({
          wants_quote: z.enum(["yes", "no"]),
        }),
        payload: z.object({
          wantsQuote: z.string(),
        }),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }) => ({
          wantsQuote: answers.wants_quote,
        }),
      },
      page: {
        name: "Post Submit Form",
      },
      steps: [
        step.choice({
          key: "wants_quote",
          slug: "quote",
          label: "Do you want a quote?",
          options: [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ],
        }),
      ],
    });
    const html = await renderFormPage(flow, {
      routeKey: "post_submit_custom",
      postSubmit: {
        trackingEvents: [{ event: "instant_form_submit_success" }],
        stepCountLabel: "Step 1 of 1",
      },
    });

    expect(html).toContain('<form class="form-panel" id="lead-form"');
    expect(html).toContain('data-form-view="post-submit"');
    expect(html).toContain('style="width: 100%"');
    expect(html).toContain("Step 1 of 1");
    expect(html).toContain("<h1 class=\"question-title\">Done.</h1>");
    expect(html).toContain('<a class="button button-primary" href="/tn/custom">Start over</a>');
    expect(html).not.toContain('id="back-button"');
    expect(html).not.toContain('id="next-button"');
    expect(html).not.toContain("window.__FORM_CONFIG__");
  });

  it("renders GTM with first-party Partytown delivery and safe dataLayer events", async () => {
    const flow = defineFormFlow({
      name: "Tracking Fixture",
      status: "ACTIVE",
      ...testFlowCopy,
      contract: {
        context: z.object({
          areaCode: z.string(),
          product: z.string(),
          advertiserName: z.string(),
        }),
        answers: z.object({
          wants_quote: z.enum(["yes", "no"]),
        }),
        payload: z.object({
          wantsQuote: z.string(),
        }),
      },
      context: {
        areaCode: "TN",
        product: "auto_insurance",
        advertiserName: "Should Not Be In Tracking Context",
      },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }) => ({
          wantsQuote: answers.wants_quote,
        }),
      },
      page: {
        name: "Tracking Form",
      },
      tracking: ({ event }) => ({
        googleTagManager: googleTagManager({
          containerId: "GTM-ABC123",
        }),
        events: [
          event.formView({
            name: "instant_form_view",
            includeContext: ["areaCode", "product"],
          }),
          event.stepView({
            name: "instant_form_step_view",
            includeContext: ["areaCode", "product"],
            includeStep: true,
          }),
          event.stepAnswer({ name: "instant_form_step_answer", includeStep: true }),
          event.validationError({ name: "instant_form_validation_error", includeStep: true }),
          event.submitAttempt({ name: "instant_form_submit_attempt", includeStep: true }),
          event.submitSuccess({ name: "instant_form_submit_success" }),
          event.submitError({ name: "instant_form_submit_error", includeStep: true }),
        ],
      }),
      steps: [
        step.choice({
          key: "wants_quote",
          slug: "quote",
          label: "Do you want a quote?",
          options: [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ],
        }),
      ],
    });

    const html = await renderFormPage(flow, { routeKey: "tracking_custom" });

    expect(html).toContain("window.dataLayer = window.dataLayer || []");
    expect(html).toContain("window.__INSTANT_INITIAL_TRACKING_EVENTS__");
    expect(html).toContain("function pushInstantInitialTrackingEvents()");
    expect(html).toContain('document.addEventListener("pt0", pushInstantInitialTrackingEvents');
    expect(html).toContain("window.setTimeout(pushInstantInitialTrackingEvents, 1500)");
    expect(html).toContain('["dataLayer.push", { preserveBehavior: true }]');
    expect(html).toContain("installGoogleTagRequestProxyShim();");
    expect(html).toContain("function installGoogleTagRequestProxyShim()");
    expect(html).toContain("window.__INSTANT_GOOGLE_TAG_PROXY_SHIM__");
    expect(html).toContain("window.__INSTANT_COMPOSE_PARTYTOWN_CONFIG__");
    expect(html).toContain('requestProxyKeys: ["googleTags","metaPixel","trustedForm"]');
    expect(html).toContain("loadScriptsOnMainThread");
    expect(html).toContain('"https://www.googletagmanager.com/debug/bootstrap"');
    expect(html).toContain('"https://www.google-analytics.com/debug/bootstrap"');
    expect(html).toContain("\\/_instant\\/google-tags\\/proxy\\?u=https%3A%2F%2Fwww\\.googletagmanager\\.com%2Fdebug%2Fbootstrap");
    expect(html).toContain("\\/_instant\\/google-tags\\/proxy\\?u=https%3A%2F%2Fwww\\.google-analytics\\.com%2Fdebug%2Fbootstrap");
    expect(html).toContain('<script data-partytown-runtime="true">/* Partytown');
    expect(html).not.toContain('<script src="/~partytown/partytown.js" data-partytown-runtime="true"></script>');
    expect(html).toContain('type="text/partytown" src="/_instant/scripts/gtm.js?id=GTM-ABC123&amp;l=dataLayer"');
    expect(html).toContain("/_instant/google-tags/proxy");
    expect(html).toContain('"param":"u"');
    expect(html).toContain("window.__INSTANT_READ_ORIGINAL_REQUEST_PROXY_URL__");
    expect(html).toContain("function patchInstantRequestProxyGetAttribute");
    expect(html).toContain('patchInstantRequestProxyUrlProperty(HTMLLinkElement.prototype, "href")');
    expect(html).toContain('"trustedForm"');
    expect(html).toContain("/_instant/meta/tr");
    expect(html.indexOf("installGoogleTagRequestProxyShim();")).toBeLessThan(
      html.indexOf('type="text/partytown" src="/_instant/scripts/gtm.js?id=GTM-ABC123&amp;l=dataLayer"'),
    );
    expect(html).toContain("instant_form_view");
    expect(html).toContain("instant_form_step_view");
    expect(html).toContain("instant_form_step_answer");
    expect(html).toContain("instant_form_validation_error");
    expect(html).toContain("instant_form_submit_attempt");
    expect(html).toContain("instant_form_submit_success");
    expect(html).toContain("instant_form_submit_error");
    expect(html).toContain('"routeKey":"tracking_custom"');
    expect(html).toContain('"tracking":{"googleTagManager"');
    expect(html).toContain('"context":{"areaCode":"TN","product":"auto_insurance"}');
    expect(html).not.toContain('"context":{"areaCode":"TN","product":"auto_insurance","advertiserName"');
  });

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
    expect(applyProductionTokensToScript("const body = { step: true }; if (!body.step) throw new Error();")).toContain(
      "body.step",
    );
    const tokenizedScript = applyProductionTokensToScript(
      "config.ui.actions.next; document.querySelector('.actions'); target.closest(\".text-input\");",
    );
    expect(tokenizedScript).toContain("config.ui.actions.next");
    expect(tokenizedScript).toContain("document.querySelector('.au')");
    expect(tokenizedScript).toContain('target.closest(".ar")');
    const tokenizedHtml = applyProductionTokens(
      '<style>.step{display:block}.actions{display:flex}</style><article class="step actions"></article><script>document.querySelector(".actions"); if (!body.step) throw new Error();</script>',
    );
    expect(tokenizedHtml).toContain(".ao{display:block}");
    expect(tokenizedHtml).toContain(".au{display:flex}");
    expect(tokenizedHtml).toContain('class="ao au"');
    expect(tokenizedHtml).toContain('".au"');
    expect(tokenizedHtml).toContain("body.step");
    const tokenizedReviewHtml = applyProductionTokens(
      '<style>.trusted-form-review-scroll-shell{display:block}.trusted-form-review-scroll-fade-bottom{opacity:1}</style><div class="trusted-form-review-scroll-shell trusted-form-review-scroll-fade-bottom"></div><script>document.querySelector(".trusted-form-review-scroll-shell");</script>',
    );
    expect(tokenizedReviewHtml).not.toContain("trusted-form-review-scroll-shell");
    expect(tokenizedReviewHtml).not.toContain("trusted-form-review-scroll-fade-bottom");
    expect(tokenizedReviewHtml).toContain(".bd{display:block}");
    expect(tokenizedReviewHtml).toContain(".bf{opacity:1}");
    expect(tokenizedReviewHtml).toContain('class="bd bf"');
    expect(tokenizedReviewHtml).toContain('".bd"');
    const tokenizedConsentHtml = applyProductionTokens(
      '<style>.consent-scroll-shell{overflow:hidden}.consent-scroll-fade-bottom{opacity:1}.consent-disclosure{font-size:0.8rem}.consent-acceptance{font-weight:800}</style><span class="consent-scroll-shell consent-scroll-fade-bottom consent-disclosure"></span><span class="consent-acceptance"></span>',
    );
    expect(tokenizedConsentHtml).not.toContain("consent-disclosure");
    expect(tokenizedConsentHtml).not.toContain("consent-scroll-shell");
    expect(tokenizedConsentHtml).not.toContain("consent-scroll-fade-bottom");
    expect(tokenizedConsentHtml).toContain(".bm{overflow:hidden}");
    expect(tokenizedConsentHtml).toContain(".bk{opacity:1}");
    expect(tokenizedConsentHtml).toContain(".bh{font-size:0.8rem}");
    expect(tokenizedConsentHtml).toContain('class="bm bk bh"');
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
    expect(transitionAsset.body).toContain("dynamicResolverDependencies");
    expect(transitionAsset.body).not.toContain("nameKeys");
    expect(transitionAsset.body).not.toContain("phoneKey");
    const transitionSteps = transitionAsset.asset.steps as readonly { key: string; config: Record<string, unknown> }[];
    expect(transitionSteps.find((stepDefinition) => stepDefinition.key === "trustedform_consent")?.config).toMatchObject({
      kind: "trusted_form_consent",
      dynamicResolverDependencies: [
        "belongs_to_state",
        "residence_state",
        "has_license",
        "has_insurance",
        "is_clean_title",
        "number_of_registered_cars",
        "first_name",
        "last_name",
        "phone_number",
      ],
      optionalDynamicResolverDependencies: ["residence_state"],
      review: {
        fields: [],
      },
      substeps: {
        consent: {
          presentation: {
            chrome: "hidden_on_mobile",
          },
        },
      },
    });
    expect(transitionSteps.find((stepDefinition) => stepDefinition.key === "trustedform_consent")?.config).not.toHaveProperty(
      "grantorSummary",
    );
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
    expect(devHtml).toContain("const nextButtonLoadingReasons = new Set();");
    expect(devHtml).toContain("function setNextButtonLoading(reason, isLoading)");
    expect(devHtml).toContain("function isNextButtonLoading()");
    expect(devHtml).toContain('setNextButtonLoading("navigation", true)');
    expect(devHtml).toContain('setNextButtonLoading("navigation", false)');
    expect(devHtml).toContain("function preloadResolvedDynamicSteps()");
    expect(devHtml).toContain("async function requestResolvedStepPayload(question)");
    expect(devHtml).toContain('"/resolutions"');
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

  it("renders step chrome presentation attributes and hiding CSS", async () => {
    const flow = defineFormFlow({
      name: "Chrome Test",
      status: "ACTIVE",
  ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({ choice_key: z.enum(["yes"]) }),
        payload: z.object({ choice: z.string() }),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }) => ({ choice: answers.choice_key }),
      },
      page: { name: "Chrome Test" },
      steps: [
        step.choice({
          key: "choice_key",
          slug: "elige",
          label: "Elige",
          presentation: {
            chrome: "hidden",
          },
          options: [{ key: "yes", label: "Si" }],
        }),
      ],
    });
    const html = await renderFormPage(flow);

    expect(html).toContain('data-form-chrome="hidden"');
    expect(html).toContain('.form-panel[data-form-chrome="hidden"]');
    expect(html).toContain('.form-panel[data-form-chrome="hidden_on_mobile"]');
    expect(html).toContain('.form-panel[data-form-chrome="hidden"] .brand');
    expect(html).toContain('.form-panel[data-form-chrome="hidden_on_mobile"] .brand');
    expect(html).toContain("grid-template-rows: minmax(0, 1fr) auto;");
    expect(html).toContain("function setFormChrome(chrome)");
    expect(html).toContain("function getStepFormChrome(question)");
  });

  it("renders optional desktop form height as a page-level presentation setting", async () => {
    const flow = defineFormFlow({
      name: "Desktop Height Test",
      status: "ACTIVE",
      ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({ choice_key: z.enum(["yes"]) }),
        payload: z.object({ choice: z.string() }),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ answers }) => ({ choice: answers.choice_key }),
      },
      page: {
        name: "Desktop Height Test",
        presentation: {
          desktopHeightPx: 780,
        },
      },
      steps: [
        step.choice({
          key: "choice_key",
          slug: "elige",
          label: "Elige",
          options: [{ key: "yes", label: "Si" }],
        }),
      ],
    });
    const html = await renderFormPage(flow);

    expect(html).toContain('style="--form-desktop-height: 780px;"');
    expect(html).toContain("height: var(--form-desktop-height, 724px);");
    expect(html).toContain("min-height: min(var(--form-desktop-height, 680px), calc(100vh - 48px));");
    expect(html).toContain("@media (max-width: 560px)");
    expect(html).toContain("height: 100dvh;");
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
    expect(html).toContain('.step[data-step-kind="trusted_form_consent"][aria-hidden="false"]');
    expect(html).toContain("grid-template-rows: auto auto minmax(0, 1fr);");
    expect(html).toContain("height: 100%;");
    expect(html).toContain("align-content: center;");
    expect(html).toContain("justify-content: center;");
    expect(html).toContain("width: min(100%, 620px);");
    expect(html).toContain("justify-self: center;");
    expect(html).toContain("@media (min-width: 561px)");
    expect(html).toContain("height: var(--form-desktop-height, 724px);");
    expect(html).not.toContain("--form-desktop-height:");
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
    expect(html).toContain("--mobile-fluid-scale: min(1, calc(100vw / 500px));");
    expect(html).toContain("--mfs: var(--mobile-fluid-scale);");
    expect(html).toContain("font-size: min(16px, 3.2vw);");
    expect(html).toContain("calc(var(--mfs-40) + env(safe-area-inset-top))");
    expect(html).toContain("var(--mfs-24)");
    expect(html).toContain("calc(var(--mfs-32) + env(safe-area-inset-bottom))");
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
    expect(html).toContain("width: min(190px, 38vw);");
    expect(html).toContain("min-height: var(--mfs-58);");
    expect(html).toContain("min-height: var(--mfs-64);");
    expect(html).toContain("min-height: var(--mfs-68);");
    expect(html).toContain("font-size: 1.12rem;");
    expect(html).toContain(".trusted-form-review-row");
    expect(html).toContain("padding-bottom: var(--mfs-8);");
    expect(html).toContain(".consent-check");
    expect(html).toContain("padding: var(--mfs-14);");
    expect(html).toContain(".consent-scroll");
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
    expect(html).toContain("Preparando opciones en Tennessee");
    expect(html).not.toContain("{{areaName}}");
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
    expect(html).toContain("const benefitTimeline = getMatchingBenefitTimeline(question.benefits)");
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
    expect(html).toContain('ctx.setNextButtonLoading(getMatchingLoadingReason(question), true)');
    expect(html).toContain('ctx.setNextButtonLoading(getMatchingLoadingReason(question), false)');
    expect(html).toContain("ctx.replaceToUrl(nextUrl ?? ctx.getRenderedNextUrl())");
    expect(html).toContain("ctx.updateNextButton(ctx.config.ui.actions.next, false)");
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

  it("renders authored Markdown display copy as sanitized server-side HTML", async () => {
    const html = await renderTennesseeForm({
      activeStepIndex: 10,
      answers: preConsentAnswers,
    });
    const unsafeHtml = renderMarkdownToHtml("Hola <script>alert(1)</script> ![bad](https://example.com/bad.png)");
    const unsafeConsentHtml = renderConsentMarkdownToHtml(
      consentMd(
        "Hola <script>alert(1)</script> ",
        tfTag("contact-method", "<teléfono>"),
        " y **negrita**.",
      ),
    );

    expect(String(phoneDisplay("+17864746654"))).toBe("(786) 474-6654");
    expect(String(phoneDisplay("17864746654"))).toBe("(786) 474-6654");
    expect(String(phoneDisplay("not a phone"))).toBe("not a phone");
    expect(String(stateDisplay("TN"))).toBe("Tennessee");
    expect(String(stateDisplay("Texas"))).toBe("Texas");
    expect(String(stateDisplay("dc"))).toBe("District of Columbia");
    expect(String(stateDisplay("No indicado"))).toBe("No indicado");
    expect(html).toContain('data-tf-element-role="consent-advertiser-name"');
    expect(html).toContain('data-tf-element-role="contact-method"');
    expect(html).toContain(".question-description {\n        max-width: 100%;");
    expect(html).toContain("margin: 0;");
    expect(html).toContain("font-weight: 400;");
    expect(html).toContain(".question-description strong,\n      .question-description b");
    expect(html).toContain("font-weight: 800;");
    expect(html).toContain(".trusted-form-review-scroll-shell {");
    expect(html).toContain(".trusted-form-review-scroll-fade-bottom");
    expect(html).toContain('.trusted-form-review-scroll-shell[data-can-scroll-down="true"] .trusted-form-review-scroll-fade-bottom');
    expect(html).toContain("function updateTrustedFormReviewScrollHints(reviewScroll)");
    expect(unsafeHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(unsafeHtml).not.toContain("<script>");
    expect(unsafeHtml).not.toContain("<img");
    expect(unsafeConsentHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(unsafeConsentHtml).toContain('<span data-tf-element-role="contact-method">&lt;teléfono&gt;</span>');
    expect(unsafeConsentHtml).toContain("<strong>negrita</strong>");
    expect(unsafeConsentHtml).not.toContain("<script>");
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

    expect(phoneHtml).toContain('"trustedFormPreloadAssets":[{"stepKey":"trustedform_consent"');
    expect(phoneHtml).toContain('"url":"/_instant/scripts/trustedform.com/tfc.js?f=xxTrustedFormCertUrl\\u0026t=true"');
    expect(phoneHtml).toContain('"as":"script","rel":"prefetch"');
    expect(phoneHtml).not.toContain('"as":"script","rel":"preload"');
    expect(phoneHtml).not.toContain('"url":"/~partytown/partytown.js"');
    expect(phoneHtml).not.toContain('"fieldName":"xxTrustedFormCertUrl"');
    expect(html).toContain('"kind":"trusted_form_consent"');
    expect(html).toContain('"slug":"consentimiento"');
    expect(html).toContain('"submitLabel":"Cotizar"');
    expect(html).toContain('"trustedForm":{"fieldName":"xxTrustedFormCertUrl"');
    expect(html).toContain('"delivery":"partytown"');
    expect(html).toContain('"scriptProxyKey":"tfc"');
    expect(html).toContain('"scriptBaseUrl":"/_instant/scripts/trustedform.com/tfc.js"');
    expect(html).toContain('"partytownLib":"/~partytown/"');
    expect(html).toContain('"partytownScriptUrl":"/~partytown/partytown.js"');
    expect(html).toContain('"preloadAssets":"when_reachable"');
    expect(html).toContain('"execute":"on_step_mount"');
    expect(html).toContain('"requireReadyBefore":"consent_substep"');
    expect(html).not.toContain("preloadOnPreviousStep");
    expect(html).toContain('"allowSubmitWithoutCert":true');
    expect(html).toContain(
      '"dynamicResolverDependencies":["belongs_to_state","residence_state","has_license","has_insurance","is_clean_title","number_of_registered_cars","first_name","last_name","phone_number"]',
    );
    expect(html).toContain('"review":{"title":"Antes de cotizar"');
    expect(html).toContain("Ya tenemos posibles opciones para usted");
    expect(html).toContain('"fields":[{"name":"review_belongs_to_state"');
    expect(html).toContain('"consent":{"title":"Antes de cotizar"');
    expect(html).toContain('"substeps":{"consent":{"presentation":{"chrome":"hidden_on_mobile"}},"review":{"presentation":{"chrome":"hidden_on_mobile"}}}');
    expect(html).toContain('"disclosure":{"text":"Al marcar esta casilla y hacer clic en “Enviar”, yo, Ana Lopez');
    expect(html).toContain(
      '\\u003cspan data-tf-element-role=\\"consent-advertiser-name\\"\\u003eLiderna Inc y a sus socios, agentes y proveedores de seguros\\u003c/span\\u003e',
    );
    expect(html).toContain(
      '\\u003cspan data-tf-element-role=\\"consent-grantor-phone\\"\\u003e(615) 555-1234\\u003c/span\\u003e',
    );
    expect(html).toContain(
      '\\u003cspan data-tf-element-role=\\"contact-method\\"\\u003e llamadas, mensajes de texto y correos electrónicos,\\u003c/span\\u003e',
    );
    expect(html).toContain('"name":"trusted_form_grantor_name","label":"Nombre completo","value":"Ana Lopez","trustedForm":{"role":"consent-grantor-name"}');
    expect(html).not.toContain('"grantorSummary"');
    expect(html).not.toContain('"nameKeys"');
    expect(html).not.toContain('"phoneKey"');
    expect(html).toContain('data-step="10" data-step-kind="trusted_form_consent"');
    expect(html).toContain('data-form-chrome="hidden_on_mobile"');
    expect(html).toContain('<h1 class="question-title" data-question-title>Antes de cotizar</h1>');
    expect(html).not.toContain('<h1 class="question-title" data-question-title><p>Antes de cotizar</p></h1>');
    expect(html).toContain('method="post" action="/api/forms/tn_custom/native-submissions"');
    expect(html).toContain('data-trusted-form-substep="review"');
    expect(html).toContain('data-trusted-form-review-scroll-shell');
    expect(html).toContain('data-can-scroll-up="false"');
    expect(html).toContain('data-can-scroll-down="false"');
    expect(html).toContain('data-trusted-form-review-scroll');
    expect(html).toContain('data-trusted-form-review-scroll-fade-top');
    expect(html).toContain('data-trusted-form-review-scroll-fade-bottom');
    expect(html).toContain('data-trusted-form-substep="consent" aria-hidden="true"');
    expect(html).toContain('data-trusted-form-field-bank');
    expect(html).toContain('name="trusted_form_grantor_name"');
    expect(html).toContain('name="trusted_form_grantor_phone"');
    expect(html).toContain('name="review_belongs_to_state"');
    const fieldBankHtml = html.match(/<div class="trusted-form-field-bank"[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(fieldBankHtml).not.toContain("data-tf-element-role");
    expect(html).toContain('Vive en Tennessee');
    expect(html).toContain("Ya tenemos posibles opciones para usted");
    expect(html).toContain("Continuar");
    expect(html).toContain('data-tf-element-role="consent-language"');
    expect(html).toContain('data-tf-element-role="consent-opt-in"');
    expect(html).toContain(".consent-disclosure {\n        font-size: 0.8rem;\n      }");
    expect(html).toContain('data-trusted-form-consent-scroll-shell');
    expect(html).toContain('data-trusted-form-consent-scroll');
    expect(html).toContain('data-trusted-form-consent-scroll-fade-top');
    expect(html).toContain('data-trusted-form-consent-scroll-fade-bottom');
    expect(html).toContain('.trusted-form-panel[data-trusted-form-substep="consent"][aria-hidden="false"]');
    expect(html).toContain('.consent-scroll-shell[data-can-scroll-down="true"] .consent-scroll-fade-bottom');
    expect(html).toContain(
      '<span class="consent-disclosure"><p>Al marcar esta casilla y hacer clic en “Enviar”, yo, <strong><span data-tf-element-role="consent-grantor-name">Ana Lopez</span></strong>',
    );
    expect(html).toContain(
      '.consent-acceptance {\n        display: block;\n        margin-top: 8px;\n        color: var(--brand-navy);\n        font-weight: 800;\n      }',
    );
    expect(html).toContain("margin-top: var(--mfs-8);");
    expect(html).not.toContain("data-consent-summary");
    expect(html).not.toContain("consent-summary");
    expect(html).toContain(
      '<dd class="trusted-form-review-value" data-tf-element-role="consent-grantor-name">Ana Lopez</dd>',
    );
    expect(html).toContain(
      '<dd class="trusted-form-review-value" data-tf-element-role="consent-grantor-phone">(615) 555-1234</dd>',
    );
    expect(html.match(/data-tf-element-role="consent-grantor-name"/g)?.length).toBe(2);
    expect(html.match(/data-tf-element-role="consent-grantor-phone"/g)?.length).toBe(2);
    expect(html).toContain("Ana Lopez");
    expect(html).toContain("(615) 555-1234");
    expect(html).toContain("function loadTrustedFormSdk(trustedForm)");
    expect(html).toContain("function loadTrustedFormSdkWithPartytown(trustedForm, sdkUrl)");
    expect(html).toContain("function ensurePartytownReady(trustedForm)");
    expect(html).toContain("window.__INSTANT_COMPOSE_PARTYTOWN_CONFIG__");
    expect(html).toContain('requestProxyKeys: ["trustedForm"]');
    expect(html).toContain("function getTrustedFormGlobalState()");
    expect(html).toContain("function shouldUseTrustedFormProxyAliases(trustedForm, url)");
    expect(html).toContain("const partytownBootstrapSource =");
    expect(html).toContain("runtime.text = partytownBootstrapSource");
    expect(html).not.toContain('runtime.src = trustedForm.partytownScriptUrl || "/~partytown/partytown.js"');
    expect(html).toContain('script.type = "text/partytown"');
    expect(html).toContain('window.dispatchEvent(new CustomEvent("ptupdate"))');
    expect(html).toContain("function preloadTrustedFormAssets()");
    expect(html).toContain("function preloadTrustedFormResource(url, resourceType, resourceRel)");
    expect(html).toContain('link.rel = resourceRel === "preload" ? "preload" : "prefetch"');
    expect(html).not.toContain("function preloadTrustedFormSdk(trustedForm)");
    expect(html).toContain("function ensureTrustedFormReady(trustedForm)");
    expect(html).toContain("function waitForTrustedFormCertUrl(trustedForm)");
    expect(html).toContain("function updateTrustedFormConsentScrollHints(consentScroll)");
    expect(html).toContain("function setFormChrome(chrome)");
    expect(html).toContain("ctx.setFormChrome(getTrustedFormSubstepChrome(question, activeSubstep))");
    expect(html).toContain("function getTrustedFormCertUrl(trustedForm = window.__FORM_CONFIG__.currentStep.trustedForm)");
    expect(html).not.toContain('ctx.updateNextButton("Preparando...", true)');
    expect(html).toContain("const accessibleLoadingLabel = config.ui.actions.loading");
    expect(html).toContain('"Enviando..."');
    expect(html).toContain('nextButton.setAttribute("aria-label", accessibleLoadingLabel)');
    expect(html).toContain('nextButton.removeAttribute("aria-label")');
    expect(html).toContain('nextButton.setAttribute("aria-busy", "true")');
    expect(html).toContain("function renderNextButtonContent(label, isLoading)");
    expect(html).toContain('spinner.className = "button-spinner"');
    expect(html).toContain("function freezeNextButtonSize()");
    expect(html).toContain("function releaseNextButtonSize()");
    expect(html).toContain('nextButton.style.minWidth = Math.ceil(rect.width) + "px"');
    expect(html).toContain('nextButton.style.minHeight = Math.ceil(rect.height) + "px"');
    expect(html).not.toContain('.button[data-loading="true"]:disabled');
    expect(html).toContain(".button-spinner");
    expect(html).toContain("@keyframes button-spinner-spin");
    expect(html).not.toContain("@media (prefers-reduced-motion: reduce)");
    expect(html).toContain("No pudimos preparar el certificado de consentimiento");
    expect(html).toContain("trustedFormCertUrl");
    expect(html).toContain('tfRole: "submit"');
    expect(html).toContain('form.addEventListener("submit"');
    expect(html).toContain('function installTrustedFormRequestProxyShim()');
    expect(html).toContain('"/_instant/trustedform/proxy"');
    expect(html).toContain('window.__INSTANT_INSTALL_REQUEST_PROXY_SHIM__("trustedForm", ["trustedForm"])');
    expect(html).toContain('ctx.form.setAttribute("data-tf-element-role", "offer")');
    expect(html).toContain("/_instant/scripts/trustedform.com/tfc.js");
    expect(html).not.toContain("https://api.trustedform.com/trustedform.js");
  });

  it("uses preload only for immediate previous-step TrustedForm warmup", async () => {
    const flow = defineFormFlow({
      name: "Previous Step TrustedForm",
      status: "ACTIVE",
      ...testFlowCopy,
      contract: {
        context: z.object({}),
        answers: z.object({
          start: z.enum(["yes"]),
        }),
        payload: z.object({}),
      },
      context: {},
      payload: {
        method: "POST",
        encoding: "json",
        mapping: () => ({}),
      },
      page: { name: "Page" },
      steps: [
        step.choice({
          key: "start",
          slug: "start",
          label: "Start?",
          options: [{ key: "yes", label: "Yes" }],
        }),
        step.trustedFormConsent({
          key: "trustedform_consent",
          slug: "consent",
          review: {
            title: text("Review"),
            fields: [
              {
                name: "trusted_form_grantor_name",
                label: "Name",
                value: "Jane Example",
                trustedForm: { role: "consent-grantor-name" },
              },
            ],
          },
          consent: {
            title: text("Consent"),
            disclosure: consentMd("Consent language."),
          },
          trustedForm: {
            delivery: "main_thread",
            scriptProxyKey: "tfc",
            preloadAssets: "previous_step",
            execute: "on_step_mount",
            requireReadyBefore: "consent_substep",
            allowSubmitWithoutCert: true,
          },
        }),
      ],
    });

    const html = await renderFormPage(flow, { routeKey: "previous_step_trustedform" });

    expect(html).toContain('"trustedFormPreloadAssets":[{"stepKey":"trustedform_consent"');
    expect(html).toContain('"as":"script","rel":"preload"');
    expect(html).not.toContain('"as":"script","rel":"prefetch"');
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
    expect(html).toContain("showErrorModal(config.ui.errors.requiredAnswer");
    expect(html).toContain("showErrorModal(submitErrorMessage)");
    expect(html).toContain("checkpointError instanceof Error ? checkpointError.message : config.ui.errors.checkpointSaveFailed");
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
    expect(html).toContain(
      '"customVariables":{"areaCode":"TN","areaName":"Tennessee","product":"auto_insurance","advertiserName":"Liderna Inc y a sus socios, agentes y proveedores de seguros"}',
    );
    expect(html).toContain('"metaPixelProxy":true');
    expect(html).toContain('"pixelId":"1465068051587670"');
    expect(html).toContain('"eventName":"LeadProgress"');
    expect(html).toContain('"eventName":"Lead"');
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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

function createAutoInsuranceTemplateTestFlow(metaTestEventCode?: string) {
  return esAutoInsuranceTemplate.create({
    flowName: "ES - Template Test",
    pageName: "Template Test",
    areaCode: "TN",
    areaName: "Tennessee",
    product: "auto_insurance",
    advertiserName: "Liderna Inc",
    gtmContainerId: "GTM-ABC123",
    metaPixelId: "1234567890",
    ...(metaTestEventCode !== undefined ? { metaTestEventCode } : {}),
  });
}

function extractRenderedFormConfig(html: string): any {
  const match = html.match(/window\.__FORM_CONFIG__ = (.*?);\n/su);

  if (!match?.[1]) {
    throw new Error("Expected rendered form config to be present.");
  }

  return JSON.parse(match[1]);
}

function createMetaRemarketingTestFlow(options: { disableResidenceStepAnswer?: boolean } = {}) {
  return defineFormFlow({
    name: "Meta Remarketing Test",
    status: "ACTIVE",
    ...testFlowCopy,
    contract: {
      context: z.object({
        areaCode: z.string(),
        areaName: z.string().optional(),
        product: z.string(),
      }),
      answers: z.object({
        belongs_to_state: z.enum(["yes", "no"]),
        residence_state: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        phone_number: z.string().optional(),
      }),
      payload: z.object({
        belongsToState: z.string(),
      }),
    },
    context: {
      areaCode: "TN",
      areaName: "Tennessee",
      product: "auto_insurance",
    },
    payload: {
      method: "POST",
      encoding: "json",
      mapping: ({ answers }) => ({
        belongsToState: answers.belongs_to_state,
      }),
    },
    page: { name: "Meta Remarketing Test" },
    tracking: ({ event }) => ({
      googleTagManager: googleTagManager({ containerId: "GTM-ABC123" }),
      events: [
        event.stepAnswer({
          name: "instant_form_step_answer",
          includeStep: true,
          meta: {
            pixelId: "1234567890",
            eventName: "LeadProgress",
            eventId: ({ event }) => event.id,
            userData: ({ context, answers }) => ({
              ph: answers.phone_number,
              fn: answers.first_name,
              ln: answers.last_name,
              st: answers.belongs_to_state === "yes" ? context.areaCode : answers.residence_state,
            }),
            customData: ({ context, answers, step }) => ({
              content_name: context.product,
              content_category: "insurance",
              market_state: context.areaCode,
              market_name: context.areaName ?? context.areaCode,
              residence_state: answers.belongs_to_state === "yes" ? context.areaCode : answers.residence_state,
              belongs_to_state: answers.belongs_to_state,
              funnel_step: step?.key,
            }),
          },
        }),
      ],
    }),
    steps: [
      step.choice({
        key: "belongs_to_state",
        slug: "state",
        label: "Do you live in Tennessee?",
        options: [
          { key: "yes", label: "Yes" },
          { key: "no", label: "No" },
        ],
      }),
      step.autocomplete({
        key: "residence_state",
        slug: "state-where-you-live",
        label: "What state do you live in?",
        autocomplete: "address-level1",
        source: autocompleteSource.usStates(),
        showWhen: {
          questionKey: "belongs_to_state",
          answer: "no",
        },
        ...(options.disableResidenceStepAnswer ? { tracking: { stepAnswer: false } } : {}),
      }),
      step.text({ key: "first_name", slug: "first-name", label: "First name", autocomplete: "given-name" }),
      step.text({ key: "last_name", slug: "last-name", label: "Last name", autocomplete: "family-name" }),
      step.phone({ key: "phone_number", slug: "phone", label: "Phone" }),
    ],
  });
}

function requireStep(flow: ReturnType<typeof createMetaRemarketingTestFlow>, key: string) {
  const stepDefinition = flow.steps.find((stepCandidate) => stepCandidate.key === key);
  if (!stepDefinition) {
    throw new Error(`Expected test flow to include step "${key}".`);
  }
  return stepDefinition;
}

function createCheckpointCookie(answers: Record<string, string>): string {
  return `${getCheckpointCookieName(routeKey)}=${encodeCheckpointAnswers(answers)}`;
}

function getPostSubmitCookie(setCookie: string): string {
  return /instant_forms_tn_custom_post_submit=[^;,]*/u.exec(setCookie)?.[0] ?? "";
}

function getBunFetchSelectedScriptRegistry() {
  const trustedFormScript = selectedScripts.tfc;
  const gtmScript = selectedScripts.gtm;
  if (!trustedFormScript || !gtmScript) {
    throw new Error("Expected selectedScripts.tfc and selectedScripts.gtm to be registered.");
  }

  return {
    gtm: gtmScript,
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
