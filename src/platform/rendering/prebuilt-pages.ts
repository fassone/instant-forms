import { readFile } from "node:fs/promises";
import path from "node:path";

import { getStepSlug, getStepUrl, type FormStep, type InstantForm } from "../flow";
import { createClientFormConfig } from "./client/config";
import {
  FORM_CONFIG_JSON_PLACEHOLDER,
  serializeForScript,
  type RenderFormPageOptions,
} from "./render-form-page";

const BUILT_FORM_CONFIG_TOKEN = JSON.stringify(FORM_CONFIG_JSON_PLACEHOLDER);

export const DIST_ROOT = "_dist";
export const DIST_FORMS_ROOT = path.join(DIST_ROOT, "forms");

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

  return injectFormConfig(html, createRequestFormConfig(form, activeStepIndex, options));
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

export function getPrebuiltFormStepHtmlPath(routeSegments: readonly string[], stepSlug: string): string {
  return path.join(process.cwd(), DIST_FORMS_ROOT, ...routeSegments, stepSlug, "index.html");
}

export function getPrebuiltUnavailableHtmlPath(name = "not-found"): string {
  return path.join(process.cwd(), DIST_FORMS_ROOT, `__${name}`, "index.html");
}

function createRequestFormConfig(form: InstantForm, activeStepIndex: number, options: PrebuiltFormPageOptions): unknown {
  const answers = options.answers ?? {};
  const stepUrlOverrides = options.stepUrlOverrides ?? createStepUrlOverrides(options.routeSegments, form);
  const getClientStepUrl = (stepDefinition: FormStep) =>
    stepUrlOverrides[stepDefinition.key] ?? getStepUrl(form, stepDefinition);

  return createClientFormConfig(form, activeStepIndex, answers, options.previewMode ?? false, getClientStepUrl);
}

function createStepUrlOverrides(routeSegments: readonly string[], form: InstantForm): Record<string, string> {
  return Object.fromEntries(
    form.steps.map((stepDefinition) => [
      stepDefinition.key,
      `/${[...routeSegments, getStepSlug(stepDefinition)].join("/")}`,
    ]),
  );
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
