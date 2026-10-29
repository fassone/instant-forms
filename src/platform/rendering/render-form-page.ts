import { renderFormStyles } from "./form-styles";
import {
  getStepSlug,
  getStepUrl,
  isCountedStep,
  isStepVisible as isServerStepVisible,
  resolveStepDynamicValues,
} from "../flow";
import type {
  AutocompleteStep,
  ChoiceStep,
  FormStep,
  InstantForm,
  InterstitialStep,
  PhoneStep,
  StepChromePresentation,
  TrustedFormReviewField,
  TextStep,
  TrustedFormConsentStep,
} from "../flow";
import { createClientFormConfig } from "./client/config";
import { getFormControllerScript } from "./client/controller-script";
import { prepareInlineAssetHtml } from "./inline-assets";
import { renderLegalLinks, renderLegalLinkScript } from "./legal-links";
import { renderConsentMarkdownToHtml, renderMarkdownToHtml } from "./markdown";
import { createLifecycleTrackingPayload, renderGoogleTagManagerHead, type TrackingEventPayload } from "./tracking";

export const FORM_CONFIG_JSON_PLACEHOLDER = "__FORM_CONFIG_JSON__";
export const FORM_CONFIG_PLACEHOLDER_EXPRESSION = JSON.stringify(FORM_CONFIG_JSON_PLACEHOLDER);

export type RenderFormPageOptions = {
  activeStepIndex?: number;
  answers?: Record<string, string>;
  initialPrefill?: Record<string, string>;
  prefillQuery?: Record<string, string>;
  previewMode?: boolean;
  routeKey?: string;
  stepUrlOverrides?: Record<string, string>;
  formConfigExpression?: string;
  transitionAssetUrl?: string;
  postSubmit?: {
    trackingEvents: readonly TrackingEventPayload[];
    stepCountLabel: string;
  };
  initialTrackingEvents?: readonly TrackingEventPayload[];
  legalReturnTo?: string;
};

export type UnavailablePageContent = {
  locale?: string;
  title: string;
  message: string;
  cta?: {
    label: string;
    href: string;
  };
};

export async function renderFormPage(form: InstantForm, options: RenderFormPageOptions = {}): Promise<string> {
  const isPostSubmit = Boolean(options.postSubmit);
  const lastStepIndex = Math.max(0, form.steps.length - 1);
  const activeStepIndex = Math.max(0, Math.min(options.activeStepIndex ?? 0, lastStepIndex));
  const initialAnswers = options.answers ?? {};
  const stepUrlOverrides = options.stepUrlOverrides ?? {};
  const getClientStepUrl = (stepDefinition: FormStep) =>
    stepUrlOverrides[stepDefinition.key] ?? getStepUrl(form, stepDefinition);
  const initialStepCountLabels = form.steps.map((_, index) => getStepCountLabel(form, index, initialAnswers));
  const initialProgressPercent = isPostSubmit ? 100 : getStepProgressPercent(form, activeStepIndex, initialAnswers);
  const activeStepSource = form.steps[activeStepIndex] ?? form.steps[0];
  const activeStep = !isPostSubmit && activeStepSource ? resolveStepDynamicValues(form, activeStepSource, initialAnswers) : undefined;
  const activeStepKind = activeStep?.kind ?? "choice";
  const routeKey = options.routeKey ?? "preview";
  const displayAreaCode = getDisplayAreaCode(form, routeKey);
  const initialStepCountAriaHidden = !isPostSubmit && activeStep && !isCountedStep(activeStep) ? ' aria-hidden="true"' : "";
  const usesNativeTrustedFormSubmit = activeStep?.kind === "trusted_form_consent";
  const initialFormChrome = isPostSubmit ? "visible" : getInitialFormChrome(activeStep);
  const initialStepCountLabel = isPostSubmit
    ? options.postSubmit?.stepCountLabel
    : initialStepCountLabels[activeStepIndex] ?? formatStepCountLabel(form.ui.progress.stepCount, 1, 1);
  const initialNextButtonLabel =
    activeStep?.kind === "trusted_form_consent"
      ? activeStep.review.nextLabel || form.ui.actions.next
      : activeStep?.kind === "interstitial" && activeStep.ctaLabel
        ? activeStep.ctaLabel
      : activeStepIndex === lastStepIndex
        ? form.ui.actions.submit
        : form.ui.actions.next;
  const renderedStepContent = isPostSubmit
    ? renderPostSubmitContent(form)
    : activeStep
      ? renderQuestion(activeStep, activeStepIndex, activeStepIndex, { ...options.initialPrefill, ...initialAnswers }, form)
      : "";
  const renderedFooter = isPostSubmit ? renderPostSubmitFooter(form) : renderFormFooter(form, initialNextButtonLabel, activeStep);
  const formStyleAttribute = getFormPanelStyleAttribute(form);
  const initialActiveStepKind = isPostSubmit ? "post_submit" : activeStepKind;
  const sharedFormAttributes = ` data-form-chrome="${escapeHtml(initialFormChrome)}" data-active-step-kind="${escapeHtml(initialActiveStepKind)}"${renderedFooter.trim() ? ' data-has-footer="true"' : ""}`;
  const formAttributes = usesNativeTrustedFormSubmit
    ? `${sharedFormAttributes} method="post" action="/api/forms/${escapeHtml(routeKey)}/native-submissions" enctype="application/x-www-form-urlencoded" data-tf-element-role="offer"`
    : `${sharedFormAttributes}${isPostSubmit ? ' data-form-view="post-submit"' : ""} novalidate`;
  const clientConfig = createClientFormConfig(
    form,
    activeStepIndex,
    initialAnswers,
    options.previewMode ?? false,
    getClientStepUrl,
    {
      routeKey,
      transitionAssetUrl: options.transitionAssetUrl,
      initialTrackingEvents: options.initialTrackingEvents,
      initialPrefill: options.initialPrefill,
      prefillQuery: options.prefillQuery,
    },
  );
  const formConfigExpression = options.formConfigExpression ?? serializeForScript(clientConfig);
  const googleTagManager = clientConfig.tracking?.googleTagManager;
  const trackingScripts = renderGoogleTagManagerHead(
    googleTagManager,
    isPostSubmit
      ? options.postSubmit?.trackingEvents ?? []
      : googleTagManager
      ? [
          createLifecycleTrackingPayload({
            form,
            routeKey,
            kind: "formView",
            step: activeStepSource,
            stepIndex: activeStepIndex,
          }),
        ].filter((eventPayload): eventPayload is NonNullable<typeof eventPayload> => Boolean(eventPayload))
      : [],
  );
  const pageMetaTags = renderPageMetaTags(form);
  const legalReturnTo = options.legalReturnTo ?? (activeStepSource ? getClientStepUrl(activeStepSource) : "/");

  const html = `<!doctype html>
<html lang="${escapeHtml(form.locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
${pageMetaTags}
    <title>${escapeHtml(isPostSubmit ? form.postSubmit.title : form.page.name)}${form.page.presentation?.showAreaBadge === false ? "" : ` | ${escapeHtml(displayAreaCode.toUpperCase())}`}</title>
${renderFormStyles()}
  </head>
  <body>
    <main class="shell${form.page.legalLinks?.length ? " legal-shell" : ""}">
      <form class="form-panel" id="lead-form"${formStyleAttribute}${formAttributes}>
        <header class="brand">
          <div class="brand-identity">
            <img class="brand-logo" src="/assets/logo.webp" alt="${escapeHtml(form.page.name)}" width="236" height="73">
            
          </div>
${form.page.presentation?.showAreaBadge === false ? "" : `          <span class="area-pill">${escapeHtml(displayAreaCode)}</span>`}
        </header>
        <div class="progress-area">
          <div class="progress-meta">
            <p class="step-count" data-step-count${initialStepCountAriaHidden}>${escapeHtml(initialStepCountLabel ?? formatStepCountLabel(form.ui.progress.stepCount, 1, 1))}</p>
          </div>
          <div class="progress-shell" aria-hidden="true">
            <div class="progress-bar" id="progress-bar" style="width: ${initialProgressPercent}%"></div>
          </div>
        </div>
        <section id="steps" data-form-steps>
          ${renderedStepContent}
        </section>
        ${renderedFooter}
      </form>
      ${renderLegalLinks(form.page.legalLinks, legalReturnTo)}
      ${isPostSubmit ? "" : renderHiddenThanks(form)}
      <div
        class="error-modal"
        id="error-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-modal-title"
        aria-describedby="error-modal-message"
        hidden
      >
        <div class="error-modal-panel">
          <h2 class="error-modal-title" id="error-modal-title">${escapeHtml(form.ui.errorModal.title)}</h2>
          <p class="error-modal-message" id="error-modal-message"></p>
          <button class="button button-primary error-modal-close" id="error-modal-close" type="button">${escapeHtml(form.ui.errorModal.closeLabel)}</button>
        </div>
      </div>
    </main>
    ${trackingScripts}
    ${isPostSubmit ? renderPostSubmitAppLinkScript(form) : renderControllerScripts(formConfigExpression, activeStepKind)}
    ${form.page.legalLinks?.length ? renderLegalLinkScript() : ""}
  </body>
</html>`;

  return prepareInlineAssetHtml(html);
}

export function renderPostSubmitPage(
  form: InstantForm,
  routeKey: string,
  postSubmit: NonNullable<RenderFormPageOptions["postSubmit"]>,
  legalReturnTo?: string,
): Promise<string> {
  return renderFormPage(form, {
    routeKey,
    postSubmit,
    legalReturnTo,
  });
}

function renderPostSubmitContent(form: InstantForm): string {
  return `
          <section class="step post-submit-step" aria-hidden="false">
            <h1 class="question-title">${escapeHtml(form.postSubmit.title)}</h1>
            <p class="post-submit-message">${escapeHtml(form.postSubmit.message)}</p>
          </section>`;
}

function renderPostSubmitFooter(form: InstantForm): string {
  if (!form.postSubmit.cta) {
    return "";
  }

  const appLinkAttributes = renderPostSubmitCtaAppLinkAttributes(form.postSubmit.cta);

  return `
        <footer>
          <div class="actions actions-single">
            <a class="button button-primary" href="${escapeHtml(form.postSubmit.cta.href)}"${appLinkAttributes}>${escapeHtml(form.postSubmit.cta.label)}</a>
          </div>
        </footer>`;
}

function renderPostSubmitCtaAppLinkAttributes(cta: NonNullable<InstantForm["postSubmit"]["cta"]>): string {
  const attributes = [
    cta.appLink?.ios ? `data-app-link-ios="${escapeHtml(cta.appLink.ios)}"` : "",
    cta.appLink?.android ? `data-app-link-android="${escapeHtml(cta.appLink.android)}"` : "",
  ].filter(Boolean);

  return attributes.length ? ` ${attributes.join(" ")}` : "";
}

function renderPostSubmitAppLinkScript(form: InstantForm): string {
  if (!form.postSubmit.cta?.appLink) {
    return "";
  }

  return `
    <script>
      (() => {
        const form = document.getElementById("lead-form");
        if (!form) {
          return;
        }

        form.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }

          const link = target.closest("[data-app-link-ios], [data-app-link-android]");
          if (!(link instanceof HTMLAnchorElement)) {
            return;
          }

          const userAgent = navigator.userAgent || "";
          const appLink = /\\b(iPhone|iPad|iPod)\\b/i.test(userAgent)
            ? link.dataset.appLinkIos
            : /\\bAndroid\\b/i.test(userAgent)
              ? link.dataset.appLinkAndroid
              : "";

          if (!appLink) {
            return;
          }

          event.preventDefault();
          window.location.href = appLink;
          window.setTimeout(() => {
            window.location.href = link.href;
          }, 800);
        });
      })();
    </script>`;
}

function renderFormFooter(form: InstantForm, nextButtonLabel: string, activeStep?: FormStep): string {
  const isWelcomeInterstitial = activeStep?.kind === "interstitial" && activeStep.interstitialTiming === "welcome";
  const actionsClass = isWelcomeInterstitial ? "actions actions-single actions-welcome" : "actions";
  const backButton = isWelcomeInterstitial
    ? ""
    : `
            <button class="button button-secondary" id="back-button" name="back" type="button">${escapeHtml(form.ui.actions.back)}</button>`;
  const backButtonTemplate = isWelcomeInterstitial
    ? `
            <template data-back-button-template><button class="button button-secondary" id="back-button" name="back" type="button">${escapeHtml(form.ui.actions.back)}</button></template>`
    : "";

  return `
        <footer>
          <div class="${actionsClass}">
            ${backButton}
            <button class="button button-primary" id="next-button" name="next" type="button">${escapeHtml(nextButtonLabel)}</button>
          </div>
          ${backButtonTemplate}
        </footer>`;
}

function renderHiddenThanks(form: InstantForm): string {
  return `
      <section class="thanks" id="thanks" tabindex="-1" hidden>
        <h1>${escapeHtml(form.postSubmit.title)}</h1>
        <p>${escapeHtml(form.postSubmit.message)}</p>
      </section>`;
}

function renderControllerScripts(formConfigExpression: string, activeStepKind: FormStep["kind"]): string {
  return `<script type="module">
      window.__FORM_CONFIG__ = ${formConfigExpression};
      const startInstantFormController = () => {
${getFormControllerScript(activeStepKind)}
      };
      const scheduleInstantFormAfterFirstPaint = window.__INSTANT_SCHEDULE_AFTER_FIRST_PAINT__ || function(callback) {
        let didRun = false;
        const run = () => {
          if (didRun) {
            return;
          }
          didRun = true;
          callback();
        };
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => window.requestAnimationFrame(run));
        } else {
          window.setTimeout(run, 0);
        }
        window.setTimeout(run, 1500);
      };
      scheduleInstantFormAfterFirstPaint(startInstantFormController);
    </script>`;
}

export async function renderUnavailablePage(content: UnavailablePageContent): Promise<string> {
  const cta = content.cta
    ? `<p class="unavailable-action"><a href="${escapeHtml(content.cta.href)}">${escapeHtml(content.cta.label)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="${escapeHtml(content.locale ?? "en")}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(content.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7f6;
        --surface: #ffffff;
        --text: #15211e;
        --muted: #5d6b66;
        --border: #d9e3df;
        --primary: #0f766e;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: var(--bg);
        color: var(--text);
        padding: 24px;
      }

      .unavailable {
        width: min(100%, 680px);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        padding: clamp(28px, 6vw, 64px);
      }

      h1 {
        margin: 0 0 16px;
        font-size: clamp(2.2rem, 8vw, 4.5rem);
        line-height: 1;
        letter-spacing: 0;
      }

      p {
        margin: 0;
        color: var(--muted);
        font-size: 1.1rem;
        line-height: 1.6;
      }

      .unavailable-action {
        margin-top: 24px;
      }

      a {
        color: var(--primary);
        font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main class="unavailable">
      <h1>${escapeHtml(content.title)}</h1>
      <p>${escapeHtml(content.message)}</p>
      ${cta}
    </main>
  </body>
</html>`;

  return prepareInlineAssetHtml(html);
}

function getVisibleStepIndexesForAnswers(form: InstantForm, answers: Record<string, string>): number[] {
  return form.steps
    .map((stepDefinition, index) => (isServerStepVisible(stepDefinition, answers) ? index : -1))
    .filter((index) => index !== -1);
}

function getCountedVisibleStepIndexesForAnswers(form: InstantForm, answers: Record<string, string>): number[] {
  return getVisibleStepIndexesForAnswers(form, answers).filter((index) => {
    const stepDefinition = form.steps[index];

    return stepDefinition ? isCountedStep(stepDefinition) : false;
  });
}

function getCountedStepNumberForIndex(countedStepIndexes: readonly number[], stepIndex: number): number {
  if (countedStepIndexes.length === 0) {
    return 1;
  }

  const countedStepsThroughStep = countedStepIndexes.filter((countedStepIndex) => countedStepIndex <= stepIndex).length;

  return Math.max(countedStepsThroughStep, 1);
}

function getStepCountLabel(form: InstantForm, stepIndex: number, answers: Record<string, string>): string {
  const countedStepIndexes = getCountedVisibleStepIndexesForAnswers(form, answers);
  const countedStepNumber = getCountedStepNumberForIndex(countedStepIndexes, stepIndex);
  const countedStepCount = Math.max(countedStepIndexes.length, 1);

  return formatStepCountLabel(form.ui.progress.stepCount, countedStepNumber, countedStepCount);
}

function formatStepCountLabel(template: string, current: number, total: number): string {
  return template.replaceAll("{{current}}", String(current)).replaceAll("{{total}}", String(total));
}

function getStepProgressPercent(form: InstantForm, stepIndex: number, answers: Record<string, string>): number {
  const countedStepIndexes = getCountedVisibleStepIndexesForAnswers(form, answers);
  const countedStepNumber = getCountedStepNumberForIndex(countedStepIndexes, stepIndex);
  const countedStepCount = Math.max(countedStepIndexes.length, 1);

  return (countedStepNumber / countedStepCount) * 100;
}

function getDisplayAreaCode(form: InstantForm, routeKey: string): string {
  return form.customVariables.areaCode || routeKey;
}

function getInitialFormChrome(stepDefinition: FormStep | undefined): StepChromePresentation {
  if (!stepDefinition) {
    return "visible";
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    return stepDefinition.substeps?.review?.presentation?.chrome ?? stepDefinition.presentation?.chrome ?? "visible";
  }

  return stepDefinition.presentation?.chrome ?? "visible";
}

function getFormPanelStyleAttribute(form: InstantForm): string {
  const desktopHeightPx = form.page.presentation?.desktopHeightPx;

  if (typeof desktopHeightPx !== "number" || !Number.isFinite(desktopHeightPx) || desktopHeightPx <= 0) {
    return "";
  }

  return ` style="--form-desktop-height: ${desktopHeightPx}px;"`;
}

type StepTemplateContext = {
  form?: InstantForm;
  index: number;
};

type StepTemplateRenderer<TStep extends FormStep> = (
  stepDefinition: TStep,
  answers: Record<string, string>,
  context: StepTemplateContext,
) => string;

const stepTemplateRegistry = {
  choice: renderOptions,
  text: renderTextInput,
  phone: renderPhoneInput,
  autocomplete: renderAutocompleteInput,
  interstitial: renderInterstitial,
  trusted_form_consent: renderTrustedFormConsent,
} satisfies Record<FormStep["kind"], StepTemplateRenderer<any>>;

export function renderTransitionStepHtml(
  stepDefinition: FormStep,
  index: number,
  answers: Record<string, string> = {},
  form?: InstantForm,
): string {
  return renderQuestion(form ? resolveStepDynamicValues(form, stepDefinition, answers) : stepDefinition, index, index, answers, form);
}

function renderQuestion(
  stepDefinition: FormStep,
  index: number,
  activeStepIndex: number,
  answers: Record<string, string>,
  form?: InstantForm,
): string {
  const isCurrent = index === activeStepIndex;
  const countsAsStep = isCountedStep(stepDefinition);
  const renderTemplate = stepTemplateRegistry[stepDefinition.template] as StepTemplateRenderer<FormStep>;
  const choiceSizeAttribute =
    stepDefinition.kind === "choice"
      ? ` data-choice-size="${escapeHtml(stepDefinition.presentation?.choiceSize ?? "default")}"`
      : "";
  const interstitialTimingAttribute =
    stepDefinition.kind === "interstitial"
      ? ` data-interstitial-timing="${escapeHtml(stepDefinition.interstitialTiming)}"`
      : "";

  return `<article class="step" data-step="${index}" data-step-kind="${escapeHtml(stepDefinition.kind)}"${choiceSizeAttribute}${interstitialTimingAttribute} data-step-counted="${String(countsAsStep)}" aria-hidden="${String(!isCurrent)}"${isCurrent ? "" : " inert"}>
    <h1 class="question-title" data-question-title>${getQuestionTitleHtml(stepDefinition)}</h1>
    ${renderQuestionDescription(stepDefinition)}
    ${renderTemplate(stepDefinition, answers, { form, index })}
  </article>`;
}

function getQuestionTitleHtml(stepDefinition: FormStep): string {
  if (stepDefinition.kind === "trusted_form_consent") {
    return escapeHtml(stepDefinition.review.title);
  }

  return escapeHtml(stepDefinition.label);
}

function renderQuestionDescription(stepDefinition: FormStep): string {
  if (stepDefinition.kind !== "trusted_form_consent") {
    return "";
  }

  const descriptionHtml = renderOptionalDisplayCopyHtml(stepDefinition.review.description);
  return `<div class="question-description" data-question-description${descriptionHtml ? "" : " hidden"}>${descriptionHtml}</div>`;
}

function renderInterstitial(stepDefinition: InterstitialStep, answers: Record<string, string>): string {
  if (stepDefinition.interstitialTiming === "welcome") {
    const benefits = Array.isArray(stepDefinition.benefits) ? stepDefinition.benefits : [];

    return renderWelcomeContent(stepDefinition.loadingLabel, benefits);
  }

  const answer = answers[stepDefinition.key];
  const isComplete = answer === stepDefinition.completionAnswer || answer === stepDefinition.seenAnswer;
  const benefitClass = isComplete ? "matching-benefit is-success is-visible" : "matching-benefit";
  const benefits = Array.isArray(stepDefinition.benefits) ? stepDefinition.benefits : [];
  const benefitContent = isComplete
    ? renderInterstitialSuccessLines(stepDefinition.successLines)
    : escapeHtml(benefits[0] ?? "");

  return `<div class="matching-content">
    <p class="matching-status" data-matching-status></p>
    <p class="${benefitClass}" data-matching-benefit>${benefitContent}</p>
  </div>`;
}

function renderInterstitialSuccessLines(successLines: InterstitialStep["successLines"]): string {
  return successLines
    .map(
      (line) =>
        `<span class="matching-success-line" data-color="${escapeHtml(line.color)}">${escapeHtml(line.text)}</span>`,
    )
    .join("");
}

function renderOptions(
  stepDefinition: ChoiceStep,
  answers: Record<string, string>,
  context: StepTemplateContext,
): string {
  const currentAnswer = answers[stepDefinition.key];
  const scrollHintLabel = stepDefinition.scrollHint?.label ?? context.form?.ui.scrollHints.moreOptions;

  return `<div class="choice-options-shell" data-choice-options-shell data-can-scroll-up="false" data-can-scroll-down="false">
    <span class="choice-options-fade choice-options-fade-top" aria-hidden="true"></span>
    <div class="options" data-choice-options-scroll>
      ${stepDefinition.options
        .map(
          (option, index) => `<label class="option" data-option>
          <input type="radio" name="${escapeHtml(stepDefinition.key)}" value="${escapeHtml(option.key)}"${
            currentAnswer === option.key ? " checked" : ""
          }>
          <span class="option-index">${index + 1}</span>
          <span class="option-text">${escapeHtml(option.value)}</span>
        </label>`,
        )
        .join("")}
    </div>
    <span class="choice-options-fade choice-options-fade-bottom" aria-hidden="true"></span>
    ${renderScrollMoreHint(scrollHintLabel)}
  </div>`;
}

function renderTextInput(stepDefinition: TextStep, answers: Record<string, string>): string {
  return renderBaseTextInput(stepDefinition, answers, "text");
}

function renderPhoneInput(stepDefinition: PhoneStep, answers: Record<string, string>): string {
  return renderBaseTextInput(stepDefinition, answers, "tel");
}

function renderTrustedFormConsent(
  stepDefinition: TrustedFormConsentStep,
  answers: Record<string, string>,
  context: StepTemplateContext,
): string {
  const checked = answers[stepDefinition.key] === stepDefinition.acceptedAnswer ? " checked" : "";
  const scrollHintLabel = context.form?.ui.scrollHints.moreContent;

  return `${renderTrustedFormFieldBank(stepDefinition)}
  <div class="trusted-form-panels" data-trusted-form-substeps data-trusted-form-active-substep="review">
    <div class="trusted-form-panel trusted-form-review" data-trusted-form-substep="review" aria-hidden="false">
      ${renderTrustedFormReviewList(stepDefinition, scrollHintLabel)}
    </div>
    <div class="trusted-form-panel" data-trusted-form-substep="consent" aria-hidden="true" inert>
      <div class="consent-card">
        <label class="consent-check" data-tf-element-role="consent-language">
          <input
            class="consent-checkbox"
            type="checkbox"
            name="${escapeHtml(stepDefinition.key)}"
            value="${escapeHtml(stepDefinition.acceptedAnswer)}"
            data-trusted-form-consent="true"
            data-tf-element-role="consent-opt-in"
            ${checked}
          >
          <span
            class="consent-scroll-shell"
            data-trusted-form-consent-scroll-shell
            data-can-scroll-up="false"
            data-can-scroll-down="false"
          >
            <span class="consent-scroll-fade consent-scroll-fade-top" data-trusted-form-consent-scroll-fade-top aria-hidden="true"></span>
            <span class="consent-copy consent-scroll" data-trusted-form-consent-scroll tabindex="0" aria-label="Texto de consentimiento">
              <span class="consent-disclosure">${renderConsentDisplayCopyHtml(stepDefinition.consent.disclosure)}</span>
              <span class="consent-acceptance">${escapeHtml(stepDefinition.consent.checkboxLabel)}</span>
            </span>
            <span class="consent-scroll-fade consent-scroll-fade-bottom" data-trusted-form-consent-scroll-fade-bottom aria-hidden="true"></span>
            ${renderScrollMoreHint(scrollHintLabel)}
          </span>
        </label>
      </div>
    </div>
  </div>`;
}

function renderTrustedFormFieldBank(stepDefinition: TrustedFormConsentStep): string {
  const fields = stepDefinition.review.fields;
  if (fields.length === 0) {
    return "";
  }

  return `<div class="trusted-form-field-bank" data-trusted-form-field-bank aria-hidden="true">
    ${fields.map(renderTrustedFormConsentInput).join("")}
  </div>`;
}

function renderTrustedFormConsentInput(field: TrustedFormReviewField): string {
  const role = field.trustedForm?.role;
  const inputType =
    role === "consent-grantor-email" ? "email" : role === "consent-grantor-phone" ? "tel" : "text";

  return `<label>
      <span>${escapeHtml(field.label)}</span>
      <input
        type="${inputType}"
        name="${escapeHtml(field.name)}"
        value="${escapeHtml(field.value)}"
        readonly
      >
    </label>`;
}

function renderTrustedFormReviewList(stepDefinition: TrustedFormConsentStep, scrollHintLabel?: string): string {
  const fields = stepDefinition.review.fields;
  const reviewItems = fields.map((field) => ({
    label: field.label,
    value: field.value,
    trustedFormRole: field.trustedForm?.role,
  }));

  if (reviewItems.length === 0) {
    return "";
  }

  return `<div
    class="trusted-form-review-scroll-shell"
    data-trusted-form-review-scroll-shell
    data-can-scroll-up="false"
    data-can-scroll-down="false"
  >
    <div
      class="trusted-form-review-scroll-fade trusted-form-review-scroll-fade-top"
      data-trusted-form-review-scroll-fade-top
      aria-hidden="true"
    ></div>
    <div class="trusted-form-review-scroll" data-trusted-form-review-scroll tabindex="0" aria-label="Resumen de información">
      <dl class="trusted-form-review-list">
      ${reviewItems
        .map(
          (item) => `<div class="trusted-form-review-row">
      <dt class="trusted-form-review-label">${escapeHtml(item.label)}</dt>
      <dd class="trusted-form-review-value"${item.trustedFormRole ? ` data-tf-element-role="${escapeHtml(item.trustedFormRole)}"` : ""}>${escapeHtml(item.value)}</dd>
    </div>`,
        )
        .join("")}
    </dl>
    </div>
    <div
      class="trusted-form-review-scroll-fade trusted-form-review-scroll-fade-bottom"
      data-trusted-form-review-scroll-fade-bottom
      aria-hidden="true"
    ></div>
    ${renderScrollMoreHint(scrollHintLabel)}
  </div>`;
}

function renderOptionalDisplayCopyHtml(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  return renderDisplayCopyHtml(value);
}

function renderDisplayCopyHtml(value: unknown): string {
  return typeof value === "string" ? renderMarkdownToHtml(value) : "";
}

function renderConsentDisplayCopyHtml(value: unknown): string {
  return typeof value === "string" ? renderConsentMarkdownToHtml(value) : "";
}

function renderBaseTextInput(
  stepDefinition: TextStep | PhoneStep,
  answers: Record<string, string>,
  inputType: "tel" | "text",
): string {
  const value = answers[stepDefinition.key] ?? "";
  const placeholder = getInputPlaceholder(stepDefinition);

  return `<input
    class="text-input"
    type="${inputType}"
    name="${escapeHtml(stepDefinition.key)}"
    autocomplete="${escapeHtml(stepDefinition.autocomplete)}"
    inputmode="${escapeHtml(stepDefinition.inputMode)}"
    placeholder="${escapeHtml(placeholder)}"
    value="${escapeHtml(value)}"
  >`;
}

function renderAutocompleteInput(
  stepDefinition: AutocompleteStep,
  answers: Record<string, string>,
  context: StepTemplateContext,
): string {
  const value = answers[stepDefinition.key] ?? "";
  const placeholder = getInputPlaceholder(stepDefinition);
  const scrollHintLabel = context.form?.ui.scrollHints.moreOptions;

  return `<div class="autocomplete-field">
    <input
      class="text-input"
      type="text"
      name="${escapeHtml(stepDefinition.key)}"
      autocomplete="${escapeHtml(stepDefinition.autocomplete)}"
      inputmode="${escapeHtml(stepDefinition.inputMode)}"
      placeholder="${escapeHtml(placeholder)}"
      value="${escapeHtml(value)}"
      data-autocomplete-input="true"
    >
    <div
      class="autocomplete-suggestions-shell"
      data-autocomplete-suggestions-shell
      data-autocomplete-empty="true"
      data-can-scroll-up="false"
      data-can-scroll-down="false"
      aria-hidden="true"
    >
      <div class="autocomplete-scroll-fade autocomplete-scroll-fade-top" aria-hidden="true"></div>
      <div class="autocomplete-suggestions" data-autocomplete-suggestions></div>
      <div class="autocomplete-scroll-fade autocomplete-scroll-fade-bottom" aria-hidden="true"></div>
      ${renderScrollMoreHint(scrollHintLabel)}
    </div>
  </div>`;
}

function renderScrollMoreHint(label: string | undefined): string {
  if (!label) {
    return "";
  }

  return `<button type="button" class="scroll-more-hint" data-scroll-more-hint>${escapeHtml(label)}</button>`;
}

function getInputPlaceholder(stepDefinition: TextStep | PhoneStep | AutocompleteStep): string {
  if (stepDefinition.kind === "autocomplete") {
    return "Escriba su estado aquí";
  }

  if (stepDefinition.type === "FIRST_NAME") {
    return "Escriba su nombre aquí";
  }

  if (stepDefinition.type === "LAST_NAME") {
    return "Escriba su apellido aquí";
  }

  if (stepDefinition.type === "PHONE") {
    return "Escriba su telefono aquí";
  }

  return "Escriba aquí";
}

export function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => {
    if (character === "<") {
      return "\\u003c";
    }

    if (character === ">") {
      return "\\u003e";
    }

    return "\\u0026";
  });
}

function renderPageMetaTags(form: InstantForm): string {
  const tags = [
    form.page.meta?.description
      ? `<meta name="description" content="${escapeHtml(form.page.meta.description)}">`
      : "",
    form.page.meta?.robots ? `<meta name="robots" content="${escapeHtml(form.page.meta.robots)}">` : "",
  ].filter(Boolean);

  return tags.map((tag) => `    ${tag}`).join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderWelcomeContent(body: string, benefits: readonly string[]): string {
  return `<div class="welcome-content" data-welcome-content>
    ${body ? `<p class="welcome-body">${escapeHtml(body)}</p>` : ""}
    ${
      benefits.length > 0
        ? `<ul class="welcome-benefits">
      ${benefits.map((benefit) => `<li class="welcome-benefit">${escapeHtml(benefit)}</li>`).join("")}
    </ul>`
        : ""
    }
  </div>`;
}
