import { readFile } from "node:fs/promises";
import path from "node:path";

import { getStepSlug, getStepUrl, type FormStep, type InstantForm } from "../flow";
import { createClientFormConfig } from "./client/config";
import { applyProductionTokens } from "./inline-assets";
import {
  FORM_CONFIG_JSON_PLACEHOLDER,
  renderTransitionStepHtml,
  serializeForScript,
  type RenderFormPageOptions,
} from "./render-form-page";

const BUILT_FORM_CONFIG_TOKEN = JSON.stringify(FORM_CONFIG_JSON_PLACEHOLDER);
const STEPS_SECTION_PATTERN = createStepsSectionPattern();

export const DIST_ROOT = "_dist";
export const DIST_FORMS_ROOT = path.join(DIST_ROOT, "forms");
export const INSTANT_FORM_ASSET_URL_PREFIX = "/_instant/forms";
export const TRANSITION_ASSET_MANIFEST_ROUTE_KEY_SEPARATOR = "/";

type PrebuiltFormsManifest = {
  transitionAssets?: Record<string, string>;
};

let prebuiltFormsManifestPromise: Promise<PrebuiltFormsManifest | undefined> | undefined;

export type PrebuiltFormPageOptions = RenderFormPageOptions & {
  routeSegments: readonly string[];
};

export async function readPrebuiltFormPage(
  form: InstantForm,
  options: PrebuiltFormPageOptions,
): Promise<string | undefined> {
  if (process.env.NODE_ENV !== "production" || options.previewMode) {
    return undefined;
  }

  const activeStepIndex = clampStepIndex(form, options.activeStepIndex ?? 0);
  const activeStep = form.steps[activeStepIndex];

  if (!activeStep) {
    return undefined;
  }

  const html = await readTextFileIfExists(getPrebuiltFormStepHtmlPath(options.routeSegments, getStepSlug(activeStep)));

  if (!html || !html.includes(BUILT_FORM_CONFIG_TOKEN)) {
    return undefined;
  }

  return injectPrebuiltFormRequestState(html, form, activeStepIndex, {
    ...options,
    routeKey: options.routeKey,
    transitionAssetUrl: options.transitionAssetUrl ?? (await getPrebuiltTransitionAssetUrl(options.routeSegments)),
  });
}

export async function readPrebuiltUnavailablePage(name = "not-found"): Promise<string | undefined> {
  if (process.env.NODE_ENV !== "production") {
    return undefined;
  }

  return readTextFileIfExists(getPrebuiltUnavailableHtmlPath(name));
}

export function injectFormConfig(html: string, formConfig: unknown): string {
  return html.replace(BUILT_FORM_CONFIG_TOKEN, serializeForScript(formConfig));
}

export function injectPrebuiltFormRequestState(
  html: string,
  form: InstantForm,
  activeStepIndex: number,
  options: PrebuiltFormPageOptions,
): string {
  const activeStep = form.steps[activeStepIndex];
  const formConfig = createRequestFormConfig(form, activeStepIndex, options);

  if (!activeStep) {
    return injectFormConfig(html, formConfig);
  }

  const activeStepHtml = applyProductionTokens(
    renderTransitionStepHtml(activeStep, activeStepIndex, options.answers ?? {}, form),
  );

  return injectFormConfig(injectActiveStepHtml(html, activeStepHtml), formConfig);
}

export function getPrebuiltFormStepHtmlPath(routeSegments: readonly string[], stepSlug: string): string {
  return path.join(process.cwd(), DIST_FORMS_ROOT, ...routeSegments, stepSlug, "index.html");
}

export function getPrebuiltUnavailableHtmlPath(name = "not-found"): string {
  return path.join(process.cwd(), DIST_FORMS_ROOT, `__${name}`, "index.html");
}

export function getPrebuiltTransitionAssetPath(hash: string): string {
  return path.join(process.cwd(), DIST_FORMS_ROOT, "_instant", "forms", hash, "transition.js");
}

export function getTransitionAssetUrl(hash: string): string {
  return `${INSTANT_FORM_ASSET_URL_PREFIX}/${hash}/transition.js`;
}

export function getTransitionAssetManifestRouteKey(routeSegments: readonly string[]): string {
  return routeSegments.join(TRANSITION_ASSET_MANIFEST_ROUTE_KEY_SEPARATOR);
}

async function getPrebuiltTransitionAssetUrl(routeSegments: readonly string[]): Promise<string | undefined> {
  const manifest = await readPrebuiltFormsManifest();

  return manifest?.transitionAssets?.[getTransitionAssetManifestRouteKey(routeSegments)];
}

async function readPrebuiltFormsManifest(): Promise<PrebuiltFormsManifest | undefined> {
  if (!prebuiltFormsManifestPromise) {
    prebuiltFormsManifestPromise = readPrebuiltFormsManifestFromDisk();
  }

  return prebuiltFormsManifestPromise;
}

async function readPrebuiltFormsManifestFromDisk(): Promise<PrebuiltFormsManifest | undefined> {
  const manifestText = await readTextFileIfExists(path.join(process.cwd(), DIST_FORMS_ROOT, "manifest.json"));
  if (!manifestText) {
    return undefined;
  }

  try {
    return JSON.parse(manifestText) as PrebuiltFormsManifest;
  } catch {
    return undefined;
  }
}

function createRequestFormConfig(
  form: InstantForm,
  activeStepIndex: number,
  options: PrebuiltFormPageOptions,
): unknown {
  const answers = options.answers ?? {};
  const stepUrlOverrides = options.stepUrlOverrides ?? createStepUrlOverrides(options.routeSegments, form);
  const getClientStepUrl = (stepDefinition: FormStep) =>
    stepUrlOverrides[stepDefinition.key] ?? getStepUrl(form, stepDefinition);

  return createClientFormConfig(form, activeStepIndex, answers, options.previewMode ?? false, getClientStepUrl, {
    routeKey: options.routeKey,
    transitionAssetUrl: options.transitionAssetUrl,
    initialTrackingEvents: options.initialTrackingEvents,
  });
}

function createStepUrlOverrides(routeSegments: readonly string[], form: InstantForm): Record<string, string> {
  return Object.fromEntries(
    form.steps.map((stepDefinition) => [
      stepDefinition.key,
      `/${[...routeSegments, getStepSlug(stepDefinition)].join("/")}`,
    ]),
  );
}

function injectActiveStepHtml(html: string, activeStepHtml: string): string {
  return html.replace(STEPS_SECTION_PATTERN, (_match, open, close) => {
    return `${String(open)}${activeStepHtml}${String(close)}`;
  });
}

function createStepsSectionPattern(): RegExp {
  const productionStepsId =
    applyProductionTokens('<section id="steps"></section>').match(/<section id="([^"]+)"/u)?.[1] ?? "steps";
  const stepIds = Array.from(new Set(["steps", productionStepsId])).map(escapeRegExp).join("|");

  return new RegExp(
    `(<section\\b(?=[^>]*(?:\\bdata-form-steps\\b|\\bid="(?:${stepIds})"))[^>]*>)[\\s\\S]*?(<\\/section>)`,
    "u",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampStepIndex(form: InstantForm, stepIndex: number): number {
  return Math.max(0, Math.min(stepIndex, Math.max(0, form.steps.length - 1)));
}

async function readTextFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isNodeFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
