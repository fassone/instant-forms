import { formsByArea } from "../../authoring/flows/registry";
import type { FormStep, InstantForm } from "./dsl/types";

export type AreaCode = keyof typeof formsByArea;

export function getFormByAreaCode(areaCode: string): InstantForm | undefined {
  const normalizedAreaCode = areaCode.trim().toLowerCase();

  return (formsByArea as Record<string, InstantForm>)[normalizedAreaCode];
}

export function getStepSlug(stepDefinition: FormStep): string {
  return stepDefinition.slug;
}

export function getLegacyStepSlug(stepDefinition: FormStep): string {
  return stepDefinition.key.replaceAll("_", "-");
}

export function getStepUrl(form: InstantForm, stepDefinition: FormStep): string {
  return `/${form.areaCode}/${getStepSlug(stepDefinition)}`;
}

export function isStepVisible(stepDefinition: FormStep, answers: Record<string, string>): boolean {
  if (stepDefinition.kind === "interstitial" && answers[stepDefinition.key] === stepDefinition.seenAnswer) {
    return false;
  }

  if (!stepDefinition.showWhen) {
    return true;
  }

  return answers[stepDefinition.showWhen.questionKey] === stepDefinition.showWhen.answer;
}

export function getVisibleSteps(form: InstantForm, answers: Record<string, string>): readonly FormStep[] {
  return form.steps.filter((stepDefinition) => isStepVisible(stepDefinition, answers));
}

export function isCountedStep(stepDefinition: FormStep): boolean {
  return stepDefinition.countsAsStep ?? stepDefinition.kind !== "interstitial";
}

export function getStepIndexBySlug(form: InstantForm, slug: string): number {
  return form.steps.findIndex((stepDefinition) => getStepSlug(stepDefinition) === slug);
}

export function getStepIndexByLegacySlug(form: InstantForm, slug: string): number {
  return form.steps.findIndex((stepDefinition) => getLegacyStepSlug(stepDefinition) === slug);
}

export function getStepByKey(form: InstantForm, key: string): FormStep | undefined {
  return form.steps.find((stepDefinition) => stepDefinition.key === key);
}
