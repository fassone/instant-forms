import { getStepSlug, getStepUrl, isCountedStep, isStepVisible as isServerStepVisible } from "../flow";
import type {
  AutocompleteStep,
  ChoiceStep,
  FormStep,
  InstantForm,
  InterstitialStep,
  PhoneStep,
  TextStep,
} from "../flow";
import { createClientFormConfig } from "./client/config";

export type RenderFormPageOptions = {
  activeStepIndex?: number;
  answers?: Record<string, string>;
  previewMode?: boolean;
  stepUrlOverrides?: Record<string, string>;
};

export type UnavailablePageContent = {
  title: string;
  message: string;
  cta?: {
    label: string;
    href: string;
  };
};

export function renderFormPage(form: InstantForm, options: RenderFormPageOptions = {}): string {
  const lastStepIndex = Math.max(0, form.steps.length - 1);
  const activeStepIndex = Math.max(0, Math.min(options.activeStepIndex ?? 0, lastStepIndex));
  const initialAnswers = options.answers ?? {};
  const stepUrlOverrides = options.stepUrlOverrides ?? {};
  const getClientStepUrl = (stepDefinition: FormStep) =>
    stepUrlOverrides[stepDefinition.key] ?? getStepUrl(form, stepDefinition);
  const initialStepCountLabels = form.steps.map((_, index) => getStepCountLabel(form, index, initialAnswers));
  const initialProgressPercent = getStepProgressPercent(form, activeStepIndex, initialAnswers);
  const activeStep = form.steps[activeStepIndex] ?? form.steps[0];
  const initialStepCountAriaHidden = activeStep && !isCountedStep(activeStep) ? ' aria-hidden="true"' : "";
  const clientConfig = createClientFormConfig(
    form,
    activeStepIndex,
    initialAnswers,
    options.previewMode ?? false,
    getClientStepUrl,
  );

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(form.page.name)} | ${escapeHtml(form.areaCode.toUpperCase())}</title>
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
          <span class="area-pill">${escapeHtml(form.areaCode)}</span>
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
          ${form.steps
            .map((question, index) => renderQuestion(question, index, activeStepIndex, initialAnswers))
            .join("")}
        </section>
        <footer>
          <div class="actions">
            <button class="button button-secondary" id="back-button" type="button">Atrás</button>
            <button class="button button-primary" id="next-button" type="button">Siguiente</button>
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
      window.__FORM_CONFIG__ = ${serializeForScript(clientConfig)};
    </script>
    <script>
      (() => {
        const config = window.__FORM_CONFIG__;
        const form = document.getElementById("lead-form");
        const thanks = document.getElementById("thanks");
        const steps = Array.from(document.querySelectorAll("[data-step]"));
        const progressBar = document.getElementById("progress-bar");
        const stepCount = document.querySelector("[data-step-count]");
        const backButton = document.getElementById("back-button");
        const nextButton = document.getElementById("next-button");
        const actions = document.querySelector(".actions");
        const errorModal = document.getElementById("error-modal");
        const errorModalMessage = document.getElementById("error-modal-message");
        const errorModalClose = document.getElementById("error-modal-close");
        const answers = { ...config.initialAnswers };
        const matchingBenefitFadeOutMs = 300;
        const matchingBenefitFadeInMs = 420;
        const matchingBenefitDisplayMs = 950;
        const matchingBenefitMinCount = 3;
        const matchingBenefitMaxCount = 4;
        let currentStep = config.activeStepIndex;
        let isSubmitting = false;
        let autoAdvanceTimer;
        let matchingTimers = [];
        let activeMatchingRunId = 0;
        let matchingTextTransitionId = 0;
        const completedMatchingSteps = new Set();
        let isActionPointerDown = false;
        let isAutocompleteSuggestionPointerDown = false;
        let focusedTextInput;
        let errorModalReturnFocusTarget;

        function clearAutoAdvance() {
          if (autoAdvanceTimer) {
            window.clearTimeout(autoAdvanceTimer);
            autoAdvanceTimer = undefined;
          }
        }

        function clearMatchingTimers() {
          activeMatchingRunId += 1;
          matchingTextTransitionId += 1;
          matchingTimers.forEach((timer) => {
            window.clearTimeout(timer);
          });
          matchingTimers = [];
        }

        function scheduleMatchingTimer(callback, delay) {
          const timer = window.setTimeout(() => {
            matchingTimers = matchingTimers.filter((candidate) => candidate !== timer);
            callback();
          }, delay);

          matchingTimers.push(timer);
        }

        function showStep(nextStep) {
          clearAutoAdvance();
          clearMatchingTimers();
          focusedTextInput = undefined;
          const visibleStepIndexes = getVisibleStepIndexes();
          const fallbackStep = getResumeVisibleStepIndex();
          const requestedStep = Math.max(0, Math.min(nextStep, steps.length - 1));
          currentStep = visibleStepIndexes.includes(requestedStep) ? requestedStep : fallbackStep;
          const question = getQuestion();
          const currentVisiblePosition = getCurrentVisiblePosition();
          const countedStepNumber = getCurrentCountedStepNumber();
          const countedStepCount = getCountedStepCount();

          steps.forEach((step, index) => {
            step.setAttribute("aria-hidden", String(index !== currentStep));
          });

          form.dataset.activeKind = question.kind;
          if (stepCount) {
            stepCount.textContent = "Paso " + countedStepNumber + " de " + countedStepCount;
            stepCount.setAttribute("aria-hidden", String(!question.countsAsStep));
          }

          progressBar.style.width = (countedStepNumber / countedStepCount) * 100 + "%";
          backButton.disabled = currentVisiblePosition === 0 || isSubmitting;
          nextButton.textContent = isCurrentStepFinal() ? "Enviar" : "Siguiente";
          nextButton.disabled =
            isSubmitting ||
            (question.kind === "interstitial" &&
              answers[question.key] !== question.completionAnswer &&
              answers[question.key] !== question.seenAnswer &&
              !completedMatchingSteps.has(question.key));
          hideErrorModal();

          if (question.kind === "interstitial") {
            runMatchingStep();
          }
        }

        function isQuestionVisible(question) {
          if (config.previewMode) {
            return true;
          }

          if (question.kind === "interstitial" && answers[question.key] === question.seenAnswer) {
            return false;
          }

          if (!question.showWhen) {
            return true;
          }

          return answers[question.showWhen.questionKey] === question.showWhen.answer;
        }

        function getVisibleStepIndexes() {
          return config.steps
            .map((question, index) => (isQuestionVisible(question) ? index : -1))
            .filter((index) => index !== -1);
        }

        function isCountedStep(question) {
          return question.countsAsStep !== false;
        }

        function getCountedVisibleStepIndexes() {
          return getVisibleStepIndexes().filter((stepIndex) => {
            const question = config.steps[stepIndex];

            return question && isCountedStep(question);
          });
        }

        function getCountedStepCount() {
          return Math.max(getCountedVisibleStepIndexes().length, 1);
        }

        function getCurrentCountedStepNumber() {
          const countedStepIndexes = getCountedVisibleStepIndexes();

          if (countedStepIndexes.length === 0) {
            return 1;
          }

          const countedStepsThroughCurrent = countedStepIndexes.filter((stepIndex) => stepIndex <= currentStep).length;

          return Math.max(countedStepsThroughCurrent, 1);
        }

        function getCurrentVisiblePosition() {
          const visibleStepIndexes = getVisibleStepIndexes();
          const visiblePosition = visibleStepIndexes.indexOf(currentStep);

          return visiblePosition === -1 ? 0 : visiblePosition;
        }

        function getResumeVisibleStepIndex() {
          const visibleStepIndexes = getVisibleStepIndexes();
          const firstUnansweredStep = visibleStepIndexes.find((stepIndex) => {
            const question = config.steps[stepIndex];

            return question && !isStepAnswered(question);
          });

          return firstUnansweredStep ?? visibleStepIndexes[visibleStepIndexes.length - 1] ?? 0;
        }

        function isStepAnswered(question) {
          const answer = answers[question.key];

          if (!answer) {
            return false;
          }

          if (question.kind === "interstitial") {
            return answer === question.seenAnswer;
          }

          return true;
        }

        function isCurrentStepFinal() {
          const visibleStepIndexes = getVisibleStepIndexes();

          return getCurrentVisiblePosition() === visibleStepIndexes.length - 1;
        }

        function getPreviousVisibleStepIndex() {
          const visibleStepIndexes = getVisibleStepIndexes();
          const previousStep = visibleStepIndexes[getCurrentVisiblePosition() - 1];

          return previousStep ?? currentStep;
        }

        function getNextVisibleStepIndex() {
          const visibleStepIndexes = getVisibleStepIndexes();
          const nextStep = visibleStepIndexes[getCurrentVisiblePosition() + 1];

          return nextStep ?? currentStep;
        }

        function getNextVisibleStepIndexAfter(stepIndex) {
          const visibleStepIndexes = getVisibleStepIndexes();
          const nextStep = visibleStepIndexes.find((visibleStepIndex) => visibleStepIndex > stepIndex);

          return nextStep ?? getResumeVisibleStepIndex();
        }

        function shouldHideMatchingStep(question) {
          return !config.previewMode && question.kind === "interstitial" && answers[question.key] === question.seenAnswer;
        }

        function getStepIndexForPath(pathname) {
          return config.steps.findIndex((question) => question.url === pathname);
        }

        function replaceHiddenMatchingRouteIfNeeded() {
          const stepIndex = getStepIndexForPath(window.location.pathname);
          const question = config.steps[stepIndex];

          if (!question || !shouldHideMatchingStep(question)) {
            return false;
          }

          replaceToStep(getNextVisibleStepIndexAfter(stepIndex));
          return true;
        }

        function navigateToStep(nextStep) {
          const safeStep = Math.max(0, Math.min(nextStep, steps.length - 1));
          const nextQuestion = config.steps[safeStep];

          showStep(safeStep);

          if (nextQuestion && window.location.pathname !== nextQuestion.url) {
            window.history.pushState({ step: safeStep }, "", nextQuestion.url);
          }
        }

        function replaceToStep(nextStep) {
          const safeStep = Math.max(0, Math.min(nextStep, steps.length - 1));
          const nextQuestion = config.steps[safeStep];

          showStep(safeStep);

          if (nextQuestion && window.location.pathname !== nextQuestion.url) {
            window.history.replaceState({ step: safeStep }, "", nextQuestion.url);
          }
        }

        function navigateToUrl(url) {
          const stepIndex = config.steps.findIndex((question) => question.url === url);

          if (stepIndex === -1) {
            window.location.href = url;
            return;
          }

          navigateToStep(stepIndex);
        }

        function replaceToUrl(url) {
          const stepIndex = config.steps.findIndex((question) => question.url === url);

          if (stepIndex === -1) {
            window.location.replace(url);
            return;
          }

          replaceToStep(stepIndex);
        }

        function getQuestion() {
          return config.steps[currentStep];
        }

        function getCurrentAnswer() {
          const question = getQuestion();

          if (question.kind === "interstitial") {
            return question.seenAnswer;
          }

          if (question.kind === "choice") {
            const checked = steps[currentStep].querySelector("input[type='radio']:checked");
            return checked ? checked.value : "";
          }

          const input = steps[currentStep].querySelector("input");
          return input ? input.value.trim() : "";
        }

        function getCurrentTextInput() {
          const input = steps[currentStep].querySelector(".text-input");

          return input instanceof HTMLInputElement ? input : undefined;
        }

        function showErrorModal(message, options = {}) {
          if (!errorModal || !errorModalMessage || !errorModalClose) {
            return;
          }

          const returnFocusTarget = options.returnFocusTarget;
          errorModalReturnFocusTarget = returnFocusTarget instanceof HTMLElement ? returnFocusTarget : nextButton;
          errorModalMessage.textContent = message;
          errorModal.hidden = false;

          window.setTimeout(() => {
            errorModalClose.focus({ preventScroll: true });
          }, 0);
        }

        function hideErrorModal() {
          if (!errorModal || !errorModalMessage || errorModal.hidden) {
            return;
          }

          errorModal.hidden = true;
          errorModalMessage.textContent = "";

          const returnFocusTarget =
            errorModalReturnFocusTarget instanceof HTMLElement ? errorModalReturnFocusTarget : nextButton;
          errorModalReturnFocusTarget = undefined;

          window.setTimeout(() => {
            if (document.body.contains(returnFocusTarget)) {
              returnFocusTarget.focus({ preventScroll: true });
            }
          }, 0);
        }

        function getValidationErrorReturnFocusTarget(shouldFocusInvalid) {
          return shouldFocusInvalid ? getCurrentTextInput() : nextButton;
        }

        function validateCurrentStep(options = {}) {
          const shouldFocusInvalid = options.focusInvalid !== false;
          const question = getQuestion();
          const answer = getCurrentAnswer();

          if (question.kind === "interstitial") {
            return true;
          }

          if (!answer) {
            showErrorModal("Esta respuesta es requerida.", {
              returnFocusTarget: question.kind !== "choice" ? getValidationErrorReturnFocusTarget(shouldFocusInvalid) : nextButton,
            });
            return false;
          }

          if (question.kind === "autocomplete") {
            const normalizedState = normalizeUsState(answer);

            if (!normalizedState) {
              showErrorModal(question.validationMessage || "Ingrese un estado válido de Estados Unidos.", {
                returnFocusTarget: getValidationErrorReturnFocusTarget(shouldFocusInvalid),
              });
              return false;
            }

            answers[question.key] = normalizedState;
            hideErrorModal();
            return true;
          }

          if (question.kind === "phone") {
            const normalizedPhone = normalizeUsPhoneNumber(answer);

            if (!normalizedPhone) {
              showErrorModal("Ingrese un número de teléfono válido de Estados Unidos.", {
                returnFocusTarget: getValidationErrorReturnFocusTarget(shouldFocusInvalid),
              });
              return false;
            }

            answers[question.key] = normalizedPhone;
            hideErrorModal();
            return true;
          }

          answers[question.key] = answer;
          hideErrorModal();
          return true;
        }

        async function saveCheckpoint(questionKey, answer) {
          if (config.previewMode) {
            answers[questionKey] = answer;
            return config.steps[currentStep]?.url;
          }

          const response = await fetch("/api/forms/" + encodeURIComponent(config.areaCode) + "/checkpoints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionKey, answer }),
          });
          const body = await response.json().catch(() => ({}));

          if (!response.ok) {
            const firstError = Array.isArray(body.errors) ? body.errors[0] : undefined;
            throw new Error(firstError && firstError.message ? firstError.message : "No pudimos guardar esta respuesta.");
          }

          if (body.answers && typeof body.answers === "object") {
            Object.keys(answers).forEach((key) => {
              delete answers[key];
            });
            Object.assign(answers, body.answers);
          }

          return typeof body.nextUrl === "string" ? getRouteAwareNextUrl(body.nextUrl) : undefined;
        }

        function getRouteAwareNextUrl(nextUrl) {
          const nextPath = getPathname(nextUrl);
          const directStep = config.steps.find((question) => question.url === nextPath);
          if (directStep) {
            return directStep.url;
          }

          const nextPathSegments = nextPath.split("/").filter(Boolean);
          const nextSlug = nextPathSegments[nextPathSegments.length - 1];
          const matchingStep = config.steps.find((question) => question.slug === nextSlug);

          return matchingStep ? matchingStep.url : nextUrl;
        }

        function getPathname(url) {
          try {
            return new URL(url, window.location.origin).pathname;
          } catch {
            return url;
          }
        }

        async function checkpointCurrentStep() {
          const question = getQuestion();
          const answer = getCurrentAnswer();

          return saveCheckpoint(question.key, answer);
        }

        function getCoverageStateName() {
          const areaCode = String(answers.residence_state || config.areaCode).toUpperCase();
          const state = config.usStates.find((candidate) => candidate.code === areaCode);

          return state ? state.name : areaCode;
        }

        function formatMatchingBenefit(benefit) {
          return benefit.replace("{{areaName}}", getCoverageStateName());
        }

        function shuffleMatchingBenefits(benefits) {
          const shuffledBenefits = [...benefits];

          for (let index = shuffledBenefits.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            const currentBenefit = shuffledBenefits[index];
            shuffledBenefits[index] = shuffledBenefits[swapIndex];
            shuffledBenefits[swapIndex] = currentBenefit;
          }

          return shuffledBenefits;
        }

        function getRandomMatchingBenefitCount(availableBenefitCount) {
          if (availableBenefitCount <= 0) {
            return 0;
          }

          const maxBenefitCount = Math.min(matchingBenefitMaxCount, availableBenefitCount);
          const minBenefitCount = Math.min(matchingBenefitMinCount, maxBenefitCount);

          return minBenefitCount + Math.floor(Math.random() * (maxBenefitCount - minBenefitCount + 1));
        }

        function getMatchingBenefitSequence(benefits) {
          const shuffledBenefits = shuffleMatchingBenefits(benefits);

          return shuffledBenefits.slice(0, getRandomMatchingBenefitCount(shuffledBenefits.length));
        }

        function getMatchingBenefitTimeline(benefits) {
          let startsAt = 0;

          return getMatchingBenefitSequence(benefits).map((text) => {
            const benefitTiming = {
              text,
              duration: matchingBenefitDisplayMs,
              startsAt,
            };

            startsAt += matchingBenefitDisplayMs;
            return benefitTiming;
          });
        }

        function getMatchingBenefitTimelineDuration(benefitTimeline) {
          return benefitTimeline.reduce((totalDuration, benefitTiming) => totalDuration + benefitTiming.duration, 0);
        }

        function getMatchingElements() {
          const step = steps[currentStep];

          return {
            step,
            status: step.querySelector("[data-matching-status]"),
            benefit: step.querySelector("[data-matching-benefit]"),
          };
        }

        function applyMatchingBenefitText(elements, text, className) {
          elements.benefit.classList.remove("is-fading-in", "is-fading-out", "is-visible", "is-success");
          renderMatchingBenefitContent(elements.benefit, text, className);

          if (className) {
            elements.benefit.classList.add(className);
          }
        }

        function fadeMatchingBenefitIn(elements, transitionId) {
          void elements.benefit.offsetWidth;
          elements.benefit.classList.add("is-fading-in");

          scheduleMatchingTimer(() => {
            if (transitionId !== matchingTextTransitionId) {
              return;
            }

            elements.benefit.classList.remove("is-fading-in");
            elements.benefit.classList.add("is-visible");
          }, matchingBenefitFadeInMs);
        }

        function setMatchingBenefitText(elements, text, className, options = {}) {
          const transitionId = (matchingTextTransitionId += 1);

          if (options.immediate) {
            applyMatchingBenefitText(elements, text, className);
            elements.benefit.classList.add("is-visible");
            return;
          }

          if (options.initial) {
            applyMatchingBenefitText(elements, text, className);
            fadeMatchingBenefitIn(elements, transitionId);
            return;
          }

          elements.benefit.classList.remove("is-fading-in", "is-visible", "is-success");
          elements.benefit.classList.add("is-fading-out");

          scheduleMatchingTimer(() => {
            if (transitionId !== matchingTextTransitionId) {
              return;
            }

            elements.benefit.classList.remove("is-fading-out", "is-success");
            renderMatchingBenefitContent(elements.benefit, text, className);

            if (className) {
              elements.benefit.classList.add(className);
            }

            fadeMatchingBenefitIn(elements, transitionId);
          }, matchingBenefitFadeOutMs);
        }

        function renderMatchingBenefitContent(element, content, className) {
          element.replaceChildren();

          if (className !== "is-success") {
            element.textContent = String(content);
            return;
          }

          const successLines = Array.isArray(content)
            ? content
            : String(content)
                .split("\\n")
                .filter((line) => line.trim())
                .map((line, index) => ({ text: line, color: index === 0 ? "brand-navy" : "accent" }));

          successLines.forEach((line) => {
            const lineElement = document.createElement("span");
            lineElement.className = "matching-success-line";
            lineElement.dataset.color = line.color;
            lineElement.textContent = line.text;
            element.appendChild(lineElement);
          });
        }

        function showMatchingSuccess(question, elements, options = {}) {
          elements.status.textContent = "";
          setMatchingBenefitText(elements, question.successLines, "is-success", options);
        }

        function runMatchingStep() {
          const question = getQuestion();

          if (question.kind !== "interstitial") {
            return;
          }

          const runId = activeMatchingRunId;
          const elements = getMatchingElements();

          if (!elements.status || !elements.benefit) {
            return;
          }

          if (answers[question.key] === question.seenAnswer) {
            showMatchingSuccess(question, elements, { immediate: true });
            scheduleMatchingTimer(() => {
              if (runId !== activeMatchingRunId) {
                return;
              }

              replaceToStep(getNextVisibleStepIndex());
            }, 300);
            return;
          }

          if (answers[question.key] === question.completionAnswer || completedMatchingSteps.has(question.key)) {
            showMatchingSuccess(question, elements, { immediate: true });
            return;
          }

          const benefitTimeline = getMatchingBenefitTimeline(question.benefits.map(formatMatchingBenefit));
          elements.status.textContent = question.loadingLabel;
          setMatchingBenefitText(elements, benefitTimeline[0]?.text ?? "", "", { initial: true });

          benefitTimeline.slice(1).forEach((benefitTiming) => {
            scheduleMatchingTimer(() => {
              if (runId !== activeMatchingRunId) {
                return;
              }

              setMatchingBenefitText(elements, benefitTiming.text, "");
            }, benefitTiming.startsAt);
          });

          const successDelay = getMatchingBenefitTimelineDuration(benefitTimeline) || matchingBenefitDisplayMs;

          scheduleMatchingTimer(() => {
            if (runId !== activeMatchingRunId) {
              return;
            }

            showMatchingSuccess(question, elements);

            scheduleMatchingTimer(() => {
              void completeMatchingStep(question, runId);
            }, 900);
          }, successDelay);
        }

        async function completeMatchingStep(question, runId) {
          if (runId !== activeMatchingRunId) {
            return;
          }

          try {
            await saveCheckpoint(question.key, question.completionAnswer);
          } catch (checkpointError) {
            showErrorModal(
              checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar este paso.",
            );
          }

          if (runId !== activeMatchingRunId) {
            return;
          }

          completedMatchingSteps.add(question.key);
          nextButton.disabled = false;
          nextButton.textContent = "Siguiente";
        }

        function normalizeUsState(value) {
          const trimmedValue = value.trim();
          if (!trimmedValue) {
            return undefined;
          }

          const upperValue = trimmedValue.toUpperCase().replace(/\\./g, "");
          const stateByCode = config.usStates.find((state) => state.code === upperValue);
          if (stateByCode) {
            return stateByCode.code;
          }

          const normalizedValue = normalizeStateText(trimmedValue);
          const stateByName = config.usStates.find((state) => normalizeStateText(state.name) === normalizedValue);
          if (stateByName) {
            return stateByName.code;
          }

          if (["washington dc", "washington d c", "dc", "d c"].includes(normalizedValue)) {
            return "DC";
          }

          return undefined;
        }

        function normalizeStateText(value) {
          return value
            .trim()
            .toLowerCase()
            .replace(/[^a-z\\s]/g, " ")
            .replace(/\\s+/g, " ")
            .trim();
        }

        function normalizeAutocompleteText(value) {
          return value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\\s]/g, " ")
            .replace(/\\s+/g, " ")
            .trim();
        }

        function getAutocompleteConfig(question) {
          if (question.kind === "autocomplete" && question.source === "usStates") {
            return {
              items: config.autocompleteSources.usStates,
              getValue: (item) => item.value,
              getLabel: (item) => item.label,
              getSearchTerms: (item) => item.searchTerms,
              normalize: normalizeAutocompleteText,
            };
          }

          return undefined;
        }

        function getAutocompleteMatchScore(item, autocompleteConfig, normalizedQuery) {
          const normalize = autocompleteConfig.normalize ?? normalizeAutocompleteText;
          const normalizedValue = normalize(autocompleteConfig.getValue(item));
          const normalizedLabel = normalize(autocompleteConfig.getLabel(item));
          const normalizedTerms = autocompleteConfig.getSearchTerms(item).map((term) => normalize(term)).filter(Boolean);

          if (normalizedValue === normalizedQuery) {
            return 0;
          }

          if (normalizedLabel === normalizedQuery) {
            return 1;
          }

          if (normalizedTerms.some((term) => term === normalizedQuery)) {
            return 2;
          }

          if (normalizedLabel.startsWith(normalizedQuery)) {
            return 3;
          }

          if (normalizedValue.startsWith(normalizedQuery)) {
            return 4;
          }

          if (normalizedTerms.some((term) => term.startsWith(normalizedQuery))) {
            return 5;
          }

          if (normalizedLabel.includes(normalizedQuery) || normalizedTerms.some((term) => term.includes(normalizedQuery))) {
            return 6;
          }

          return Number.POSITIVE_INFINITY;
        }

        function getAutocompleteSuggestions(value, autocompleteConfig) {
          const normalizedQuery = (autocompleteConfig.normalize ?? normalizeAutocompleteText)(value);

          if (!normalizedQuery) {
            return [];
          }

          return autocompleteConfig.items
            .map((item) => {
              return {
                item,
                score: getAutocompleteMatchScore(item, autocompleteConfig, normalizedQuery),
              };
            })
            .filter((result) => Number.isFinite(result.score))
            .sort(
              (left, right) =>
                left.score - right.score ||
                autocompleteConfig.getLabel(left.item).localeCompare(autocompleteConfig.getLabel(right.item)),
            )
            .map((result) => result.item);
        }

        function updateAutocompleteSuggestionScrollHints(suggestions) {
          const shell = suggestions.closest("[data-autocomplete-suggestions-shell]");
          if (!(shell instanceof HTMLElement)) {
            return;
          }

          const canScrollUp = suggestions.scrollTop > 1;
          const canScrollDown = suggestions.scrollTop + suggestions.clientHeight < suggestions.scrollHeight - 1;
          shell.dataset.canScrollUp = String(canScrollUp);
          shell.dataset.canScrollDown = String(canScrollDown);
        }

        function updateAutocompleteSuggestionPanel(shell, suggestions, isEmpty) {
          shell.dataset.autocompleteEmpty = String(isEmpty);
          shell.setAttribute("aria-hidden", String(isEmpty));

          if (isEmpty) {
            shell.dataset.canScrollUp = "false";
            shell.dataset.canScrollDown = "false";
            return;
          }

          suggestions.scrollTop = 0;
          window.requestAnimationFrame(() => {
            updateAutocompleteSuggestionScrollHints(suggestions);
          });
        }

        function updateAutocompleteSuggestions(input) {
          const step = input.closest("[data-step]");
          const shell = step ? step.querySelector("[data-autocomplete-suggestions-shell]") : undefined;
          const suggestions = step ? step.querySelector("[data-autocomplete-suggestions]") : undefined;
          const question = getQuestion();
          const autocompleteConfig = getAutocompleteConfig(question);

          if (!(shell instanceof HTMLElement) || !(suggestions instanceof HTMLElement) || !autocompleteConfig) {
            return;
          }

          const suggestedItems = getAutocompleteSuggestions(input.value, autocompleteConfig);
          suggestions.replaceChildren(
            ...suggestedItems.map((item) => {
              const button = document.createElement("button");
              button.className = "autocomplete-suggestion";
              button.type = "button";
              button.dataset.autocompleteSuggestion = autocompleteConfig.getValue(item);
              button.dataset.autocompleteLabel = autocompleteConfig.getLabel(item);
              button.innerHTML =
                "<span>" +
                autocompleteConfig.getLabel(item) +
                "</span><span class=\\"autocomplete-suggestion-value\\">" +
                autocompleteConfig.getValue(item) +
                "</span>";

              return button;
            }),
          );
          updateAutocompleteSuggestionPanel(shell, suggestions, suggestedItems.length === 0);
        }

        function normalizeUsPhoneNumber(value) {
          const parsedPhone = parseUsPhoneInput(value);
          if (parsedPhone.kind !== "us" || parsedPhone.nationalDigits.length !== 10) {
            return undefined;
          }

          return "+1" + parsedPhone.nationalDigits;
        }

        function parseUsPhoneInput(value) {
          const trimmedValue = value.trim();
          const digitsOnly = value.replace(/\\D/g, "");
          const startsWithPlus = trimmedValue.startsWith("+");
          const hasPlusUsPrefix = startsWithPlus && digitsOnly.startsWith("1");
          const hasPlainUsPrefix = !startsWithPlus && trimmedValue.startsWith("1") && digitsOnly.startsWith("1");

          if (startsWithPlus && digitsOnly.length > 0 && !hasPlusUsPrefix) {
            return {
              kind: "unsupported",
              prefix: "",
              nationalDigits: "",
              digitsOnly,
            };
          }

          const prefix = hasPlusUsPrefix ? "+1" : hasPlainUsPrefix ? "1" : "";
          const nationalDigits = prefix ? digitsOnly.slice(1, 11) : digitsOnly.slice(0, 10);

          return {
            kind: "us",
            prefix,
            nationalDigits,
            digitsOnly,
          };
        }

        function isUnsupportedInternationalPhone(value) {
          return parseUsPhoneInput(value).kind === "unsupported";
        }

        function formatUsPhoneForDisplay(value) {
          const parsedPhone = parseUsPhoneInput(value);
          if (parsedPhone.kind === "unsupported") {
            return value;
          }

          const trimmedValue = value.trim();
          if (trimmedValue.startsWith("+") && parsedPhone.digitsOnly.length === 0) {
            return value;
          }

          const formattedNationalPhone = formatNationalPhoneDigits(parsedPhone.nationalDigits);

          if (!parsedPhone.prefix) {
            return formattedNationalPhone;
          }

          return formattedNationalPhone ? parsedPhone.prefix + " " + formattedNationalPhone : parsedPhone.prefix;
        }

        function formatNationalPhoneDigits(digits) {
          if (digits.length === 0) {
            return "";
          }

          if (digits.length <= 3) {
            return "(" + digits;
          }

          if (digits.length <= 6) {
            return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
          }

          return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6, 10);
        }

        function isPhoneInputElement(value) {
          return value instanceof HTMLInputElement && value.type === "tel";
        }

        function isAutocompleteInputElement(value) {
          return value instanceof HTMLInputElement && value.dataset.autocompleteInput === "true";
        }

        function isTextInputElement(value) {
          return value instanceof HTMLInputElement && value.classList.contains("text-input");
        }

        function isTypingTarget(value) {
          if (value instanceof HTMLInputElement) {
            return ["email", "number", "password", "search", "tel", "text", "url"].includes(value.type);
          }

          return (
            value instanceof HTMLTextAreaElement ||
            value instanceof HTMLSelectElement ||
            (value instanceof HTMLElement && value.isContentEditable)
          );
        }

        function isMobileViewport() {
          return window.matchMedia("(max-width: 560px)").matches;
        }

        function handlePhoneInput(input) {
          const formattedValue = formatUsPhoneForDisplay(input.value);
          if (formattedValue === input.value) {
            return;
          }

          input.value = formattedValue;
          input.setSelectionRange(formattedValue.length, formattedValue.length);
        }

        function shouldBlockExtraPhoneInput(event) {
          const target = event.target;
          if (!isPhoneInputElement(target)) {
            return false;
          }

          const parsedPhone = parseUsPhoneInput(target.value);
          if (parsedPhone.kind !== "us" || parsedPhone.nationalDigits.length < 10) {
            return false;
          }

          const selectionStart = target.selectionStart ?? target.value.length;
          const selectionEnd = target.selectionEnd ?? selectionStart;
          if (selectionStart !== selectionEnd) {
            return false;
          }

          if (event.inputType?.startsWith("delete")) {
            return false;
          }

          const inputData = event.data ?? "";
          return event.inputType === "insertFromPaste" || /[\\d()+.\\-\\s]/.test(inputData);
        }

        function shouldSubmitTextInputOnMobileBlur(event) {
          const target = event.target;
          const question = getQuestion();
          if (
            !isMobileViewport() ||
            !isTextInputElement(target) ||
            !question.behavior.mobileBlurSubmit ||
            isActionPointerDown ||
            isSubmitting
          ) {
            return false;
          }

          if (!steps[currentStep].contains(target)) {
            return false;
          }

          return true;
        }

        function shouldSubmitTextInputOnMobileOutsidePointer(event) {
          const activeElement = isTextInputElement(document.activeElement) ? document.activeElement : focusedTextInput;
          const target = event.target;
          const question = getQuestion();
          if (
            !isMobileViewport() ||
            !isTextInputElement(activeElement) ||
            !question.behavior.mobileBlurSubmit ||
            isActionPointerDown ||
            isSubmitting
          ) {
            return false;
          }

          if (!steps[currentStep].contains(activeElement) || !(target instanceof HTMLElement)) {
            return false;
          }

          return (
            target !== activeElement &&
            !target.closest(".text-input") &&
            !target.closest(".actions") &&
            !target.closest("[data-autocomplete-suggestions-shell]")
          );
        }

        function advanceAfterChoiceSelection(answer) {
          const question = getQuestion();
          if (question.kind !== "choice" || isSubmitting) {
            return;
          }

          clearAutoAdvance();
          answers[question.key] = answer;
          hideErrorModal();
          const selectedStep = currentStep;

          autoAdvanceTimer = window.setTimeout(() => {
            autoAdvanceTimer = undefined;

            if (currentStep !== selectedStep) {
              return;
            }

            void (async () => {
              try {
                const nextUrl = await saveCheckpoint(question.key, answer);

                if (isCurrentStepFinal()) {
                  await submitForm();
                  return;
                }

                navigateToUrl(nextUrl ?? config.steps[getNextVisibleStepIndex()].url);
              } catch (checkpointError) {
                showErrorModal(
                  checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar esta respuesta.",
                );
              }
            })();
          }, 180);
        }

        function getClickedChoiceInput(target) {
          if (!(target instanceof HTMLElement)) {
            return undefined;
          }

          const option = target.closest(".option");
          if (!(option instanceof HTMLElement) || !steps[currentStep].contains(option)) {
            return undefined;
          }

          const input = option.querySelector("input[type='radio']");

          return input instanceof HTMLInputElement ? input : undefined;
        }

        function advanceAfterChoiceClick(event) {
          const question = getQuestion();
          if (question.kind !== "choice") {
            return;
          }

          const input = getClickedChoiceInput(event.target);
          if (!input || !input.checked) {
            return;
          }

          advanceAfterChoiceSelection(input.value);
        }

        function selectChoiceByNumberKey(event) {
          if (event.defaultPrevented || isTypingTarget(event.target)) {
            return false;
          }

          const question = getQuestion();
          if (question.kind !== "choice" || !/^[1-9]$/.test(event.key)) {
            return false;
          }

          const optionIndex = Number(event.key) - 1;
          const optionKey = question.options[optionIndex];
          if (!optionKey) {
            return false;
          }

          const option = Array.from(steps[currentStep].querySelectorAll("input[type='radio']")).find(
            (input) => input.value === optionKey,
          );
          if (!(option instanceof HTMLInputElement)) {
            return false;
          }

          event.preventDefault();
          option.checked = true;
          advanceAfterChoiceSelection(option.value);
          return true;
        }

        async function submitForm() {
          clearAutoAdvance();
          isSubmitting = true;
          let submitErrorMessage;
          showStep(currentStep);

          try {
            const response = await fetch("/api/forms/" + encodeURIComponent(config.areaCode) + "/submissions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ answers }),
            });

            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              const firstError = Array.isArray(body.errors) ? body.errors[0] : undefined;
              throw new Error(firstError && firstError.message ? firstError.message : "No pudimos enviar el formulario.");
            }

            form.hidden = true;
            thanks.hidden = false;
            thanks.focus();
          } catch (submitError) {
            submitErrorMessage = submitError instanceof Error ? submitError.message : "No pudimos enviar el formulario.";
          } finally {
            isSubmitting = false;
            showStep(currentStep);
          }

          if (submitErrorMessage) {
            showErrorModal(submitErrorMessage);
          }
        }

        async function handleNext(options = {}) {
          clearAutoAdvance();

          const question = getQuestion();
          const shouldFocusInvalid = options.focusInvalid ?? !isMobileViewport();

          if (question.kind === "interstitial" && answers[question.key] === question.seenAnswer) {
            navigateToStep(getNextVisibleStepIndex());
            return;
          }

          if (question.kind === "interstitial") {
            if (config.previewMode) {
              delete answers[question.key];
              completedMatchingSteps.delete(question.key);
              showStep(currentStep);
              return;
            }

            if (answers[question.key] !== question.completionAnswer && !completedMatchingSteps.has(question.key)) {
              return;
            }

            try {
              const nextUrl = await saveCheckpoint(question.key, question.seenAnswer);

              replaceToUrl(nextUrl ?? config.steps[getNextVisibleStepIndex()].url);
            } catch (checkpointError) {
              showErrorModal(
                checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar este paso.",
              );
            }
            return;
          }

          if (!validateCurrentStep({ focusInvalid: shouldFocusInvalid })) {
            return;
          }

          try {
            const nextUrl = await checkpointCurrentStep();

            if (isCurrentStepFinal()) {
              await submitForm();
              return;
            }

            navigateToUrl(nextUrl ?? config.steps[getNextVisibleStepIndex()].url);
          } catch (checkpointError) {
            showErrorModal(
              checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar esta respuesta.",
            );
          }
        }

        nextButton.addEventListener("click", () => {
          void handleNext();
        });

        backButton.addEventListener("click", () => {
          clearAutoAdvance();
          navigateToStep(getPreviousVisibleStepIndex());
        });

        if (errorModal && errorModalClose) {
          errorModalClose.addEventListener("click", () => {
            hideErrorModal();
          });

          errorModal.addEventListener("click", (event) => {
            if (event.target === errorModal) {
              hideErrorModal();
            }
          });
        }

        if (actions) {
          actions.addEventListener("pointerdown", () => {
            isActionPointerDown = true;
          });

          ["pointerup", "pointercancel"].forEach((eventName) => {
            window.addEventListener(eventName, () => {
              window.setTimeout(() => {
                isActionPointerDown = false;
              }, 0);
            });
          });
        }

        form.addEventListener("pointerdown", (event) => {
          const target = event.target;
          if (target instanceof HTMLElement && target.closest("[data-autocomplete-suggestions-shell]")) {
            isAutocompleteSuggestionPointerDown = true;
          }
        });

        ["pointerup", "pointercancel"].forEach((eventName) => {
          window.addEventListener(eventName, () => {
            window.setTimeout(() => {
              isAutocompleteSuggestionPointerDown = false;
            }, 0);
          });
        });

        document.addEventListener("pointerdown", (event) => {
          if (shouldSubmitTextInputOnMobileOutsidePointer(event)) {
            void handleNext({ focusInvalid: false });
          }
        });

        form.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) {
            return;
          }

          const suggestion = target.closest("[data-autocomplete-suggestion]");
          if (!(suggestion instanceof HTMLElement)) {
            return;
          }

          const step = suggestion.closest("[data-step]");
          const input = step ? step.querySelector("[data-autocomplete-input]") : undefined;
          if (!(input instanceof HTMLInputElement)) {
            return;
          }

          input.value = suggestion.dataset.autocompleteLabel ?? suggestion.dataset.autocompleteSuggestion ?? "";
          const suggestionsShell = step?.querySelector("[data-autocomplete-suggestions-shell]");
          if (suggestionsShell instanceof HTMLElement) {
            suggestionsShell.dataset.autocompleteEmpty = "true";
            suggestionsShell.dataset.canScrollUp = "false";
            suggestionsShell.dataset.canScrollDown = "false";
            suggestionsShell.setAttribute("aria-hidden", "true");
          }

          nextButton.click();
        });

        form.addEventListener(
          "scroll",
          (event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.matches("[data-autocomplete-suggestions]")) {
              updateAutocompleteSuggestionScrollHints(target);
            }
          },
          true,
        );

        form.addEventListener("click", (event) => {
          advanceAfterChoiceClick(event);
        });

        form.addEventListener("beforeinput", (event) => {
          if (shouldBlockExtraPhoneInput(event)) {
            event.preventDefault();
          }
        });

        form.addEventListener("input", (event) => {
          const target = event.target;
          if (isTextInputElement(target)) {
            focusedTextInput = target;
          }

          if (!isPhoneInputElement(target)) {
            if (isAutocompleteInputElement(target)) {
              updateAutocompleteSuggestions(target);
            }
            return;
          }

          handlePhoneInput(target);
        });

        form.addEventListener("focusin", (event) => {
          const target = event.target;
          if (isTextInputElement(target)) {
            focusedTextInput = target;
          }

          if (isAutocompleteInputElement(target)) {
            updateAutocompleteSuggestions(target);
          }
        });

        form.addEventListener("focusout", (event) => {
          if (shouldSubmitTextInputOnMobileBlur(event)) {
            void handleNext({ focusInvalid: false });
          }

          if (event.target === focusedTextInput) {
            focusedTextInput = undefined;
          }
        });

        form.addEventListener("change", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement) || target.type !== "radio" || !target.checked) {
            return;
          }

          advanceAfterChoiceSelection(target.value);
        });

        form.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            nextButton.click();
            return;
          }
        });

        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && errorModal && !errorModal.hidden) {
            event.preventDefault();
            hideErrorModal();
            return;
          }

          selectChoiceByNumberKey(event);
        });

        window.addEventListener("popstate", () => {
          if (replaceHiddenMatchingRouteIfNeeded()) {
            return;
          }

          const stepIndex = getStepIndexForPath(window.location.pathname);

          if (stepIndex !== -1) {
            showStep(stepIndex);
            const currentQuestion = config.steps[currentStep];

            if (currentQuestion && currentQuestion.url !== window.location.pathname) {
              window.history.replaceState({ step: currentStep }, "", currentQuestion.url);
            }
          }
        });

        window.addEventListener("pageshow", (event) => {
          if (config.previewMode || !event.persisted) {
            return;
          }

          const stepIndex = getStepIndexForPath(window.location.pathname);
          const question = config.steps[stepIndex];

          if (question && question.kind === "interstitial") {
            window.location.reload();
            return;
          }

          replaceHiddenMatchingRouteIfNeeded();
        });

        showStep(config.activeStepIndex);
        if (!replaceHiddenMatchingRouteIfNeeded()) {
          const currentQuestion = config.steps[currentStep];
          if (currentQuestion) {
            window.history.replaceState({ step: currentStep }, "", currentQuestion.url);
          }
        }
      })();
    </script>
  </body>
</html>`;
}

export function renderUnavailablePage(content: UnavailablePageContent): string {
  const cta = content.cta
    ? `<p class="unavailable-action"><a href="${escapeHtml(content.cta.href)}">${escapeHtml(content.cta.label)}</a></p>`
    : "";

  return `<!doctype html>
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

type StepTemplateRenderer<TStep extends FormStep> = (stepDefinition: TStep, answers: Record<string, string>) => string;

const stepTemplateRegistry = {
  choice: renderOptions,
  text: renderTextInput,
  phone: renderPhoneInput,
  autocomplete: renderAutocompleteInput,
  interstitial: renderInterstitial,
} satisfies Record<FormStep["kind"], StepTemplateRenderer<any>>;

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
  const benefitContent = isComplete
    ? renderInterstitialSuccessLines(stepDefinition.successLines)
    : escapeHtml(stepDefinition.benefits[0] ?? "");

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
        (option, index) => `<label class="option">
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

function serializeForScript(value: unknown): string {
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
