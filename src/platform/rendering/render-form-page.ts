import {
  getStepSlug,
  getStepUrl,
  isCountedStep,
  isDynamicResolver,
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
  TextStep,
  TrustedFormConsentStep,
} from "../flow";
import { createClientFormConfig } from "./client/config";
import { getFormControllerScript } from "./client/controller-script";
import { prepareInlineAssetHtml } from "./inline-assets";

export const FORM_CONFIG_JSON_PLACEHOLDER = "__FORM_CONFIG_JSON__";
export const FORM_CONFIG_PLACEHOLDER_EXPRESSION = JSON.stringify(FORM_CONFIG_JSON_PLACEHOLDER);

export type RenderFormPageOptions = {
  activeStepIndex?: number;
  answers?: Record<string, string>;
  previewMode?: boolean;
  routeKey?: string;
  stepUrlOverrides?: Record<string, string>;
  formConfigExpression?: string;
  transitionAssetUrl?: string;
};

export type UnavailablePageContent = {
  title: string;
  message: string;
  cta?: {
    label: string;
    href: string;
  };
};

export async function renderFormPage(form: InstantForm, options: RenderFormPageOptions = {}): Promise<string> {
  const lastStepIndex = Math.max(0, form.steps.length - 1);
  const activeStepIndex = Math.max(0, Math.min(options.activeStepIndex ?? 0, lastStepIndex));
  const initialAnswers = options.answers ?? {};
  const stepUrlOverrides = options.stepUrlOverrides ?? {};
  const getClientStepUrl = (stepDefinition: FormStep) =>
    stepUrlOverrides[stepDefinition.key] ?? getStepUrl(form, stepDefinition);
  const initialStepCountLabels = form.steps.map((_, index) => getStepCountLabel(form, index, initialAnswers));
  const initialProgressPercent = getStepProgressPercent(form, activeStepIndex, initialAnswers);
  const activeStepSource = form.steps[activeStepIndex] ?? form.steps[0];
  const activeStep = activeStepSource ? resolveStepDynamicValues(form, activeStepSource, initialAnswers) : undefined;
  const activeStepKind = activeStep?.kind ?? "choice";
  const routeKey = options.routeKey ?? "preview";
  const displayAreaCode = getDisplayAreaCode(form, routeKey);
  const initialStepCountAriaHidden = activeStep && !isCountedStep(activeStep) ? ' aria-hidden="true"' : "";
  const clientConfig = createClientFormConfig(
    form,
    activeStepIndex,
    initialAnswers,
    options.previewMode ?? false,
    getClientStepUrl,
    {
      routeKey,
      transitionAssetUrl: options.transitionAssetUrl,
    },
  );
  const formConfigExpression = options.formConfigExpression ?? serializeForScript(clientConfig);

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(form.page.name)} | ${escapeHtml(displayAreaCode.toUpperCase())}</title>
    <style>
      :root {
        color-scheme: light;
        --brand-navy: #073b8e;
        --brand-blue: #064df6;
        --brand-pink: #f80057;
        --brand-cream: #fff7df;
        --bg: #073b8e;
        --surface: #fffdf4;
        --text: #111427;
        --muted: #4d5878;
        --border: #d9dff0;
        --primary: var(--brand-blue);
        --primary-dark: #0437b3;
        --accent: var(--brand-pink);
        --danger: #b42318;
        --shadow: 0 24px 70px rgba(1, 28, 76, 0.22);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        background:
          linear-gradient(145deg, rgba(6, 77, 246, 0.24), rgba(248, 0, 87, 0.08)),
          var(--bg);
        color: var(--text);
      }

      button,
      input {
        font: inherit;
      }

      .shell {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 24px;
      }

      .form-panel {
        width: min(100%, 720px);
        min-height: min(680px, calc(100vh - 48px));
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        gap: 28px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(255, 253, 244, 0.98);
        box-shadow: var(--shadow);
        padding: clamp(24px, 5vw, 56px);
      }

      .brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .brand-identity {
        min-width: 0;
      }

      .brand-logo {
        display: block;
        width: clamp(160px, 34vw, 220px);
        height: auto;
      }

      .brand-trust {
        margin-top: 4px;
        color: var(--brand-navy);
        font-size: 0.95rem;
        font-weight: 800;
        letter-spacing: 0;
      }

      .area-pill {
        border: 1px solid rgba(6, 77, 246, 0.22);
        border-radius: 999px;
        background: rgba(6, 77, 246, 0.07);
        color: var(--brand-navy);
        font-size: 0.85rem;
        font-weight: 700;
        padding: 6px 12px;
        text-transform: uppercase;
      }

      .progress-area {
        position: relative;
      }

      .progress-meta {
        position: absolute;
        right: 0;
        bottom: calc(100% + 6px);
        display: flex;
        min-height: 1.3em;
        align-items: center;
        justify-content: flex-end;
      }

      .progress-shell {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: #e5e9f7;
      }

      .progress-bar {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--brand-blue), var(--brand-pink));
        transition: width 180ms ease;
      }

      .step {
        display: none;
        align-self: center;
      }

      .step[aria-hidden="false"] {
        display: block;
      }

      #steps {
        min-height: 0;
      }

      #steps:has(.step[data-step-kind="interstitial"][aria-hidden="false"]) {
        display: grid;
      }

      #steps:has(.step[data-step-kind="autocomplete"][aria-hidden="false"]) {
        display: grid;
      }

      .step[data-step-kind="interstitial"][aria-hidden="false"] {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        align-self: stretch;
      }

      .step[data-step-kind="autocomplete"][aria-hidden="false"] {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        align-self: stretch;
      }

      .step-count {
        margin: 0;
        color: var(--brand-navy);
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.3;
      }

      .step-count[aria-hidden="true"] {
        visibility: hidden;
      }

      .question-title {
        max-width: 100%;
        margin: 0 0 28px;
        font-size: clamp(2rem, 4vw, 2.75rem);
        line-height: 1.02;
        letter-spacing: 0;
        text-wrap: balance;
      }

      .matching-content {
        position: relative;
        display: grid;
        min-height: 300px;
        place-items: center;
        align-content: center;
        justify-content: center;
        gap: 16px;
        overflow: visible;
        text-align: center;
      }

      .step[data-step-kind="interstitial"] .matching-content {
        height: 100%;
        min-height: 0;
      }

      .matching-status {
        margin: 0;
        color: var(--brand-navy);
        font-size: clamp(1.2rem, 3vw, 1.65rem);
        font-weight: 800;
      }

      .matching-benefit {
        position: relative;
        z-index: 2;
        min-height: 1.4em;
        margin: 0;
        color: var(--accent);
        width: min(100%, 620px);
        justify-self: center;
        font-size: clamp(1.45rem, 4vw, 2.2rem);
        font-weight: 800;
        line-height: 1.1;
        opacity: 0;
        will-change: opacity;
      }

      .matching-benefit.is-visible {
        opacity: 1;
      }

      .matching-benefit.is-fading-in {
        animation: matching-benefit-fade-in 420ms ease forwards;
      }

      .matching-benefit.is-fading-out {
        animation: matching-benefit-fade-out 300ms ease forwards;
      }

      .matching-benefit.is-success {
        z-index: 5;
        max-width: 100%;
        font-size: clamp(1.35rem, 3vw, 1.65rem);
        line-height: 1.18;
        letter-spacing: 0;
        text-wrap: balance;
        -webkit-text-stroke: 0.025em rgba(255, 253, 244, 0.9);
        paint-order: stroke fill;
        white-space: pre-line;
        text-shadow:
          0 0.025em 0 rgba(255, 253, 244, 0.74),
          0 0.1em 0.22em rgba(7, 59, 142, 0.14);
        filter: drop-shadow(0 12px 24px rgba(7, 59, 142, 0.1));
      }

      .matching-success-line {
        display: block;
      }

      .matching-success-line[data-color="brand-navy"] {
        color: var(--brand-navy);
      }

      .matching-success-line[data-color="accent"] {
        color: var(--accent);
      }

      .matching-status:empty {
        display: none;
      }

      .options {
        display: grid;
        gap: 12px;
      }

      .option {
        display: flex;
        min-height: 64px;
        align-items: center;
        gap: 14px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #ffffff;
        cursor: pointer;
        padding: 16px 18px;
        transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
      }

      .option:hover,
      .option:has(input:focus-visible) {
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(6, 77, 246, 0.13);
        transform: translateY(-1px);
      }

      .option:has(input:checked) {
        border-color: var(--brand-blue);
        background: #eff4ff;
      }

      .option input {
        width: 20px;
        height: 20px;
        accent-color: var(--primary);
      }

      .option-index {
        display: inline-grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--brand-navy);
        font-size: 0.85rem;
        font-weight: 800;
      }

      .option-text {
        font-size: 1.15rem;
        font-weight: 800;
      }

      .text-input {
        width: 100%;
        min-height: 68px;
        border: 0;
        border-bottom: 3px solid var(--border);
        border-radius: 0;
        background: transparent;
        color: var(--text);
        font-size: clamp(1.5rem, 5vw, 3rem);
        font-weight: 400;
        outline: 0;
        padding: 6px 0 6px;
      }

      .text-input::placeholder {
        color: rgba(21, 24, 43, 0.34);
        font-weight: 400;
        opacity: 1;
      }

      .text-input:focus {
        border-color: var(--primary);
      }

      .autocomplete-field {
        min-height: 0;
        position: relative;
      }

      .step[data-step-kind="autocomplete"][aria-hidden="false"] .autocomplete-field {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .autocomplete-suggestions-shell {
        position: relative;
        min-height: 0;
        margin-top: 12px;
      }

      .step[data-step-kind="autocomplete"][aria-hidden="false"] .autocomplete-suggestions-shell {
        align-self: stretch;
        height: auto;
      }

      .autocomplete-suggestions-shell[data-autocomplete-empty="true"] {
        pointer-events: none;
        visibility: hidden;
      }

      .autocomplete-suggestions {
        display: grid;
        height: 100%;
        align-content: start;
        gap: 8px;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 2px 4px 2px 0;
        -webkit-overflow-scrolling: touch;
        scrollbar-gutter: stable;
      }

      .autocomplete-scroll-fade {
        position: absolute;
        right: 0;
        left: 0;
        z-index: 2;
        height: 32px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease;
      }

      .autocomplete-scroll-fade-top {
        top: 0;
        background: linear-gradient(180deg, var(--surface), rgba(255, 253, 244, 0));
      }

      .autocomplete-scroll-fade-bottom {
        bottom: 0;
        background: linear-gradient(0deg, var(--surface), rgba(255, 253, 244, 0));
      }

      .autocomplete-suggestions-shell[data-can-scroll-up="true"] .autocomplete-scroll-fade-top,
      .autocomplete-suggestions-shell[data-can-scroll-down="true"] .autocomplete-scroll-fade-bottom {
        opacity: 1;
      }

      .autocomplete-suggestion {
        min-height: 48px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #ffffff;
        color: var(--text);
        cursor: pointer;
        font-weight: 800;
        padding: 0 14px;
        text-align: left;
      }

      .autocomplete-suggestion:focus-visible,
      .autocomplete-suggestion:hover {
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(6, 77, 246, 0.13);
      }

      .autocomplete-suggestion-value {
        color: var(--brand-navy);
        font-size: 0.85em;
        margin-left: 6px;
      }

      .consent-card {
        display: grid;
        width: min(100%, 620px);
        gap: 14px;
      }

      .consent-summary {
        margin: 0;
        color: var(--muted);
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.35;
      }

      .consent-check {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #ffffff;
        cursor: pointer;
        padding: 18px;
      }

      .consent-check:has(input:focus-visible) {
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(6, 77, 246, 0.13);
      }

      .consent-checkbox {
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        margin: 2px 0 0;
        accent-color: var(--accent);
      }

      .consent-copy {
        color: var(--text);
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.5;
      }

      .consent-acceptance {
        display: block;
        margin-top: 8px;
        color: var(--brand-navy);
        font-weight: 800;
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .button {
        min-height: 48px;
        border: 1px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 700;
        padding: 0 20px;
      }

      .button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .button-secondary {
        border-color: var(--border);
        background: #ffffff;
        color: var(--text);
      }

      .button-primary {
        background: var(--accent);
        color: #ffffff;
      }

      .button-primary:hover {
        background: #d9004d;
      }

      .error-modal {
        position: fixed;
        inset: 0;
        z-index: 20;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(255, 253, 244, 0.72);
      }

      .error-modal[hidden] {
        display: none;
      }

      .error-modal-panel {
        width: min(100%, 380px);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        box-shadow: 0 22px 60px rgba(1, 28, 76, 0.24);
        padding: 24px;
      }

      .error-modal-title {
        margin: 0 0 10px;
        color: var(--brand-navy);
        font-size: 1.25rem;
        line-height: 1.2;
      }

      .error-modal-message {
        margin: 0 0 20px;
        color: var(--text);
        font-size: 1rem;
        line-height: 1.45;
      }

      .error-modal-close {
        width: 100%;
        min-height: 48px;
        min-width: 0;
        padding: 0 20px;
        font-size: 1rem;
      }

      .thanks,
      .unavailable {
        width: min(100%, 720px);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(255, 253, 244, 0.98);
        box-shadow: var(--shadow);
        padding: clamp(28px, 6vw, 64px);
      }

      .thanks[hidden] {
        display: none;
      }

      .thanks h1,
      .unavailable h1 {
        margin: 0 0 16px;
        font-size: clamp(2.2rem, 8vw, 4.5rem);
        line-height: 1;
        letter-spacing: 0;
      }

      .thanks p,
      .unavailable p {
        margin: 0;
        color: var(--muted);
        font-size: 1.1rem;
        line-height: 1.6;
      }

      @keyframes matching-benefit-fade-in {
        from {
          opacity: 0;
        }

        to {
          opacity: 1;
        }
      }

      @keyframes matching-benefit-fade-out {
        from {
          opacity: 1;
        }

        to {
          opacity: 0;
        }
      }

      @media (min-width: 561px) {
        .form-panel {
          height: 724px;
        }

        .options {
          gap: 16px;
        }

        .option {
          min-height: 78px;
          gap: 18px;
          padding: 20px 24px;
        }

        .option input {
          width: 24px;
          height: 24px;
        }

        .option-index {
          width: 34px;
          height: 34px;
          font-size: 0.95rem;
        }

        .option-text {
          font-size: 1.28rem;
        }

        .actions {
          gap: 16px;
        }

        .button {
          min-height: 70px;
          min-width: 190px;
          padding: 0 42px;
          font-size: 1.4rem;
        }
      }

      @media (max-width: 560px) {
        html {
          height: 100%;
          background: var(--surface);
          overscroll-behavior: none;
        }

        body {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          overscroll-behavior: none;
          background: var(--surface);
        }

        .shell {
          align-items: stretch;
          height: 100dvh;
          min-height: 0;
          overflow: hidden;
          padding: 0;
        }

        .form-panel,
        .thanks,
        .unavailable {
          height: 100dvh;
          min-height: 0;
          width: 100%;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          padding: calc(40px + env(safe-area-inset-top)) 24px calc(32px + env(safe-area-inset-bottom));
        }

        .form-panel:has(.step[aria-hidden="false"][data-step-kind="text"] .text-input:focus),
        .form-panel:has(.step[aria-hidden="false"][data-step-kind="phone"] .text-input:focus) {
          grid-template-rows: auto auto auto auto;
          align-content: start;
          overflow: hidden;
        }

        .brand {
          align-items: flex-start;
        }

        .brand-logo {
          width: min(58vw, 190px);
        }

        .question-title {
          max-width: 100%;
        }

        #steps {
          min-height: 0;
        }

        .actions {
          align-items: stretch;
          flex-direction: column;
        }

        .button {
          flex: 1;
          min-height: 58px;
          padding: 0 24px;
          font-size: 1.12rem;
        }

        .button-primary {
          order: 1;
        }

        .button-secondary {
          order: 2;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <form class="form-panel" id="lead-form" novalidate>
        <header class="brand">
          <div class="brand-identity">
            <img class="brand-logo" src="/assets/logo.webp" alt="${escapeHtml(form.page.name)}" width="220" height="63">
            
          </div>
          <span class="area-pill">${escapeHtml(displayAreaCode)}</span>
        </header>
        <div class="progress-area">
          <div class="progress-meta">
            <p class="step-count" data-step-count${initialStepCountAriaHidden}>${escapeHtml(initialStepCountLabels[activeStepIndex] ?? "Paso 1 de 1")}</p>
          </div>
          <div class="progress-shell" aria-hidden="true">
            <div class="progress-bar" id="progress-bar" style="width: ${initialProgressPercent}%"></div>
          </div>
        </div>
        <section id="steps">
          ${activeStep ? renderQuestion(activeStep, activeStepIndex, activeStepIndex, initialAnswers) : ""}
        </section>
        <footer>
          <div class="actions">
            <button class="button button-secondary" id="back-button" name="back" type="button">Atrás</button>
            <button class="button button-primary" id="next-button" name="next" type="button">Siguiente</button>
          </div>
        </footer>
      </form>
      <section class="thanks" id="thanks" tabindex="-1" hidden>
        <h1>Gracias.</h1>
        <p>Recibimos su información. Un agente se pondrá en contacto con usted pronto.</p>
      </section>
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
          <h2 class="error-modal-title" id="error-modal-title">Revise esta respuesta</h2>
          <p class="error-modal-message" id="error-modal-message"></p>
          <button class="button button-primary error-modal-close" id="error-modal-close" type="button">Entendido</button>
        </div>
      </div>
    </main>
    <script>
      window.__FORM_CONFIG__ = ${formConfigExpression};
    </script>
    <script>
${getFormControllerScript(activeStepKind)}
    </script>
  </body>
</html>`;

  return prepareInlineAssetHtml(html);
}

export async function renderUnavailablePage(content: UnavailablePageContent): Promise<string> {
  const cta = content.cta
    ? `<p class="unavailable-action"><a href="${escapeHtml(content.cta.href)}">${escapeHtml(content.cta.label)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="es">
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

  return `Paso ${countedStepNumber} de ${countedStepCount}`;
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

type StepTemplateRenderer<TStep extends FormStep> = (stepDefinition: TStep, answers: Record<string, string>) => string;

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
  return renderQuestion(form ? resolveStepDynamicValues(form, stepDefinition, answers) : stepDefinition, index, index, answers);
}

function renderQuestion(
  stepDefinition: FormStep,
  index: number,
  activeStepIndex: number,
  answers: Record<string, string>,
): string {
  const isCurrent = index === activeStepIndex;
  const countsAsStep = isCountedStep(stepDefinition);
  const renderTemplate = stepTemplateRegistry[stepDefinition.template] as StepTemplateRenderer<FormStep>;

  return `<article class="step" data-step="${index}" data-step-kind="${escapeHtml(stepDefinition.kind)}" data-step-counted="${String(countsAsStep)}" aria-hidden="${String(!isCurrent)}">
    <h1 class="question-title">${escapeHtml(stepDefinition.label)}</h1>
    ${renderTemplate(stepDefinition, answers)}
  </article>`;
}

function renderInterstitial(stepDefinition: InterstitialStep, answers: Record<string, string>): string {
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

function renderOptions(stepDefinition: ChoiceStep, answers: Record<string, string>): string {
  const currentAnswer = answers[stepDefinition.key];

  return `<div class="options">
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
  </div>`;
}

function renderTextInput(stepDefinition: TextStep, answers: Record<string, string>): string {
  return renderBaseTextInput(stepDefinition, answers, "text");
}

function renderPhoneInput(stepDefinition: PhoneStep, answers: Record<string, string>): string {
  return renderBaseTextInput(stepDefinition, answers, "tel");
}

function renderTrustedFormConsent(stepDefinition: TrustedFormConsentStep, answers: Record<string, string>): string {
  const checked = answers[stepDefinition.key] === stepDefinition.acceptedAnswer ? " checked" : "";
  const grantorSummary = renderTrustedFormGrantorSummary(stepDefinition, answers);

  return `<div class="consent-card">
    ${grantorSummary}
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
      <span class="consent-copy">
        <span>${escapeHtml(stepDefinition.disclosure)}</span>
        <span class="consent-acceptance">${escapeHtml(stepDefinition.checkboxLabel)}</span>
      </span>
    </label>
  </div>`;
}

function renderTrustedFormGrantorSummary(
  stepDefinition: TrustedFormConsentStep,
  answers: Record<string, string>,
): string {
  const summary = stepDefinition.grantorSummary;
  if (!summary || isDynamicResolver(summary)) {
    return "";
  }

  const name = summary.name?.trim() ?? "";
  const phone = summary.phone?.trim() ?? "";

  if (!name && !phone) {
    return "";
  }

  const nameText = name
    ? `<span data-tf-element-role="consent-grantor-name">${escapeHtml(name)}</span>`
    : "";
  const phoneText = phone
    ? `<span data-tf-element-role="consent-grantor-phone">${escapeHtml(phone)}</span>`
    : "";
  const separator = nameText && phoneText ? " · " : "";

  return `<p class="consent-summary" data-consent-summary="true">${nameText}${separator}${phoneText}</p>`;
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

function renderAutocompleteInput(stepDefinition: AutocompleteStep, answers: Record<string, string>): string {
  const value = answers[stepDefinition.key] ?? "";
  const placeholder = getInputPlaceholder(stepDefinition);

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
    </div>
  </div>`;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
