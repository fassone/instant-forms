import { createHash } from "node:crypto";

import { US_STATES } from "../../shared/data/us-states";
import { getStepSlug, type FormStep, type InstantForm } from "../flow";
import { createClientTransitionSteps, type ClientStep } from "./client/config";
import { getTransitionAssetScript, type TransitionAssetPayload } from "./client/controller-script";
import { applyProductionTokens, applyProductionTokensToScript } from "./inline-assets";
import { renderTransitionStepHtml } from "./render-form-page";
import { createStateAutocompleteItems } from "../steps/autocomplete/ranking";

export type TransitionAssetStep = {
  index: number;
  key: string;
  slug: string;
  url: string;
  html: string;
  config: ClientStep;
};

export type TransitionAsset = TransitionAssetPayload & {
  steps: readonly TransitionAssetStep[];
};

export type TransitionAssetBuildResult = {
  asset: TransitionAsset;
  body: string;
  hash: string;
};

export async function buildTransitionAsset(
  form: InstantForm,
  routeSegments: readonly string[],
  stepUrlOverrides: Record<string, string>,
): Promise<TransitionAssetBuildResult> {
  const getClientStepUrl = (stepDefinition: FormStep) => stepUrlOverrides[stepDefinition.key] ?? "";
  const clientSteps = createClientTransitionSteps(form, getClientStepUrl);
  const hasAutocompleteStep = form.steps.some((stepDefinition) => stepDefinition.kind === "autocomplete");
  const asset: TransitionAsset = {
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
    ...(hasAutocompleteStep
      ? {
          usStates: US_STATES,
          autocompleteSources: {
            usStates: createStateAutocompleteItems(US_STATES),
          },
        }
      : {}),
  };
  const body = await minifyTransitionScript(getTransitionAssetScript(asset, applyProductionTokensToScript));

  return {
    asset,
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

async function minifyTransitionScript(script: string): Promise<string> {
  const { minify } = await import("html-minifier-terser");
  const html = await minify(`<script>${script}</script>`, {
    collapseWhitespace: true,
    minifyJS: {
      compress: true,
      mangle: true,
    },
    removeComments: true,
  });

  return `${html.replace(/^<script>/u, "").replace(/<\/script>$/u, "")}\n`;
}

function getClientStepAt(clientSteps: readonly ClientStep[], index: number): ClientStep {
  const clientStep = clientSteps[index];

  if (!clientStep) {
    throw new Error(`Missing client transition step at index ${index}.`);
  }

  return clientStep;
}
