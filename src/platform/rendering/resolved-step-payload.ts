import type { FormStep, InstantForm } from "../flow";
import { createClientResolvedStep, type ClientStep } from "./client/config";
import { applyProductionTokens, getInlineAssetMode } from "./inline-assets";
import { renderTransitionStepHtml } from "./render-form-page";

export type ResolvedStepPayload = {
  index: number;
  key: string;
  slug: string;
  url: string;
  html: string;
  config: ClientStep;
};

export function createResolvedStepPayload(
  form: InstantForm,
  stepIndex: number,
  answers: Record<string, string>,
  getClientStepUrl: (stepDefinition: FormStep) => string,
): ResolvedStepPayload {
  const stepDefinition = form.steps[stepIndex];

  if (!stepDefinition) {
    throw new Error(`Missing step at index ${stepIndex}.`);
  }

  const html = renderTransitionStepHtml(stepDefinition, stepIndex, answers, form);
  const url = getClientStepUrl(stepDefinition);

  return {
    index: stepIndex,
    key: stepDefinition.key,
    slug: stepDefinition.slug,
    url,
    html: getInlineAssetMode() === "built" ? applyProductionTokens(html) : html,
    config: createClientResolvedStep(form, stepDefinition, url, answers),
  };
}
