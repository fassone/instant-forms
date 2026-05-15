import { createHash } from "node:crypto";

import { getStepSlug, type FormStep, type InstantForm } from "../flow";
import { createClientTransitionSteps, type ClientStep } from "./client/config";
import { applyProductionTokens } from "./inline-assets";
import { renderTransitionStepHtml } from "./render-form-page";

export type TransitionBundleStep = {
  index: number;
  key: string;
  slug: string;
  url: string;
  html: string;
  config: ClientStep;
};

export type TransitionBundle = {
  version: 1;
  route: string;
  steps: readonly TransitionBundleStep[];
  stepUrlsBySlug: Record<string, string>;
};

export type TransitionBundleBuildResult = {
  bundle: TransitionBundle;
  body: string;
  hash: string;
};

export async function buildTransitionBundle(
  form: InstantForm,
  routeSegments: readonly string[],
  stepUrlOverrides: Record<string, string>,
): Promise<TransitionBundleBuildResult> {
  const getClientStepUrl = (stepDefinition: FormStep) => stepUrlOverrides[stepDefinition.key] ?? "";
  const clientSteps = createClientTransitionSteps(form, getClientStepUrl);
  const bundle: TransitionBundle = {
    version: 1,
    route: `/${routeSegments.join("/")}`,
    steps: await Promise.all(
      form.steps.map(async (stepDefinition, index) => ({
        index,
        key: stepDefinition.key,
        slug: getStepSlug(stepDefinition),
        url: getClientStepUrl(stepDefinition),
        html: await minifyTransitionHtml(applyProductionTokens(renderTransitionStepHtml(stepDefinition, index, {}))),
        config: getClientStepAt(clientSteps, index),
      })),
    ),
    stepUrlsBySlug: Object.fromEntries(
      form.steps.map((stepDefinition) => [getStepSlug(stepDefinition), getClientStepUrl(stepDefinition)]),
    ),
  };
  const body = `${JSON.stringify(bundle)}\n`;

  return {
    bundle,
    body,
    hash: createHash("sha256").update(body).digest("hex").slice(0, 16),
  };
}

async function minifyTransitionHtml(html: string): Promise<string> {
  const { minify } = await import("html-minifier-terser");

  return minify(html, {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: false,
    removeAttributeQuotes: false,
    removeComments: true,
    removeEmptyAttributes: false,
    removeOptionalTags: false,
    sortAttributes: true,
    sortClassName: true,
  });
}

function getClientStepAt(clientSteps: readonly ClientStep[], index: number): ClientStep {
  const clientStep = clientSteps[index];

  if (!clientStep) {
    throw new Error(`Missing client transition step at index ${index}.`);
  }

  return clientStep;
}
