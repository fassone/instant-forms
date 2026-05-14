import { getQuestionSlug, getStepUrl, isCountedStep, isQuestionVisible as isServerQuestionVisible } from "./forms";
import type { ChoiceQuestion, FormQuestion, InstantForm, InterstitialQuestion, StateQuestion, TextQuestion } from "./forms";
import { US_STATES } from "./us-states";

type ClientQuestionCondition = {
  questionKey: string;
  answer: string;
};

type ClientQuestionBase = {
  key: string;
  slug: string;
  url: string;
  countsAsStep: boolean;
  showWhen?: ClientQuestionCondition;
};

type ClientQuestion =
  | (ClientQuestionBase & {
      kind: "choice";
      options: readonly string[];
    })
  | (ClientQuestionBase & {
      kind: "text";
      type: TextQuestion["type"];
    })
  | (ClientQuestionBase & {
      kind: "state";
      type: StateQuestion["type"];
    })
  | (ClientQuestionBase & {
      kind: "interstitial";
      type: InterstitialQuestion["type"];
      loadingLabel: string;
      successLabel: string;
      completionAnswer: InterstitialQuestion["completionAnswer"];
      seenAnswer: InterstitialQuestion["seenAnswer"];
      benefits: readonly string[];
    });

type ClientFormConfig = {
  stateCode: string;
  activeStepIndex: number;
  initialAnswers: Record<string, string>;
  previewMode: boolean;
  questions: readonly ClientQuestion[];
  usStates: typeof US_STATES;
};

export type RenderFormPageOptions = {
  activeStepIndex?: number;
  answers?: Record<string, string>;
  previewMode?: boolean;
  stepUrlOverrides?: Record<string, string>;
};

export function renderFormPage(form: InstantForm, options: RenderFormPageOptions = {}): string {
  const lastStepIndex = Math.max(0, form.questions.length - 1);
  const activeStepIndex = Math.max(0, Math.min(options.activeStepIndex ?? 0, lastStepIndex));
  const initialAnswers = options.answers ?? {};
  const stepUrlOverrides = options.stepUrlOverrides ?? {};
  const getClientStepUrl = (question: FormQuestion) => stepUrlOverrides[question.key] ?? getStepUrl(form, question);
  const initialStepCountLabels = form.questions.map((_, index) => getStepCountLabel(form, index, initialAnswers));
  const initialProgressPercent = getStepProgressPercent(form, activeStepIndex, initialAnswers);
  const clientConfig: ClientFormConfig = {
    stateCode: form.stateCode,
    activeStepIndex,
    initialAnswers,
    previewMode: options.previewMode ?? false,
    usStates: US_STATES,
    questions: form.questions.map((question) => {
      if (question.kind === "choice") {
        return {
          kind: "choice",
          key: question.key,
          slug: getQuestionSlug(question),
          url: getClientStepUrl(question),
          countsAsStep: isCountedStep(question),
          showWhen: question.showWhen,
          options: question.options.map((option) => option.key),
        };
      }

      if (question.kind === "state") {
        return {
          kind: "state",
          key: question.key,
          slug: getQuestionSlug(question),
          url: getClientStepUrl(question),
          countsAsStep: isCountedStep(question),
          showWhen: question.showWhen,
          type: question.type,
        };
      }

      if (question.kind === "interstitial") {
        return {
          kind: "interstitial",
          key: question.key,
          slug: getQuestionSlug(question),
          url: getClientStepUrl(question),
          countsAsStep: isCountedStep(question),
          showWhen: question.showWhen,
          type: question.type,
          loadingLabel: question.loadingLabel,
          successLabel: question.successLabel,
          completionAnswer: question.completionAnswer,
          seenAnswer: question.seenAnswer,
          benefits: question.benefits,
        };
      }

      return {
        kind: "text",
        key: question.key,
        slug: getQuestionSlug(question),
        url: getClientStepUrl(question),
        countsAsStep: isCountedStep(question),
        showWhen: question.showWhen,
        type: question.type,
      };
    }),
  };

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(form.page.name)} | ${escapeHtml(form.stateCode.toUpperCase())}</title>
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

      .state-pill {
        border: 1px solid rgba(6, 77, 246, 0.22);
        border-radius: 999px;
        background: rgba(6, 77, 246, 0.07);
        color: var(--brand-navy);
        font-size: 0.85rem;
        font-weight: 700;
        padding: 6px 12px;
        text-transform: uppercase;
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

      .step[data-step-kind="interstitial"][aria-hidden="false"] {
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        align-self: stretch;
      }

      .step-count {
        margin: 0 0 12px;
        color: var(--brand-navy);
        font-size: 0.95rem;
        font-weight: 700;
      }

      .step[data-step-counted="false"] .step-count {
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

      .matching-success-line:first-child {
        color: var(--brand-navy);
      }

      .matching-success-line:last-child {
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

      .state-field {
        position: relative;
      }

      .state-suggestions {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      .state-suggestions[hidden] {
        display: none;
      }

      .state-suggestion {
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

      .state-suggestion:focus-visible,
      .state-suggestion:hover {
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(6, 77, 246, 0.13);
      }

      .state-suggestion-code {
        color: var(--brand-navy);
        font-size: 0.85em;
        margin-left: 6px;
      }

      .error {
        min-height: 2.6em;
        margin: 0;
        color: red;
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.3;
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

        .form-panel:has(.step[aria-hidden="false"][data-step-kind="text"] .text-input) {
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
          <span class="state-pill">${escapeHtml(form.stateCode)}</span>
        </header>
        <div class="progress-shell" aria-hidden="true">
          <div class="progress-bar" id="progress-bar" style="width: ${initialProgressPercent}%"></div>
        </div>
        <section id="steps">
          ${form.questions
            .map((question, index) =>
              renderQuestion(question, index, initialStepCountLabels[index] ?? "Paso 1 de 1", activeStepIndex, initialAnswers),
            )
            .join("")}
        </section>
        <footer>
          <p class="error" id="form-error" role="alert"></p>
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
        const backButton = document.getElementById("back-button");
        const nextButton = document.getElementById("next-button");
        const actions = document.querySelector(".actions");
        const error = document.getElementById("form-error");
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
        let isStateSuggestionPointerDown = false;
        let focusedTextInput;

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
          const stepCount = steps[currentStep].querySelector("[data-step-count]");
          if (stepCount) {
            stepCount.textContent = "Paso " + countedStepNumber + " de " + countedStepCount;
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
          error.textContent = "";

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
          return config.questions
            .map((question, index) => (isQuestionVisible(question) ? index : -1))
            .filter((index) => index !== -1);
        }

        function isCountedStep(question) {
          return question.countsAsStep !== false;
        }

        function getCountedVisibleStepIndexes() {
          return getVisibleStepIndexes().filter((stepIndex) => {
            const question = config.questions[stepIndex];

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
            const question = config.questions[stepIndex];

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
          return config.questions.findIndex((question) => question.url === pathname);
        }

        function replaceHiddenMatchingRouteIfNeeded() {
          const stepIndex = getStepIndexForPath(window.location.pathname);
          const question = config.questions[stepIndex];

          if (!question || !shouldHideMatchingStep(question)) {
            return false;
          }

          replaceToStep(getNextVisibleStepIndexAfter(stepIndex));
          return true;
        }

        function navigateToStep(nextStep) {
          const safeStep = Math.max(0, Math.min(nextStep, steps.length - 1));
          const nextQuestion = config.questions[safeStep];

          showStep(safeStep);

          if (nextQuestion && window.location.pathname !== nextQuestion.url) {
            window.history.pushState({ step: safeStep }, "", nextQuestion.url);
          }
        }

        function replaceToStep(nextStep) {
          const safeStep = Math.max(0, Math.min(nextStep, steps.length - 1));
          const nextQuestion = config.questions[safeStep];

          showStep(safeStep);

          if (nextQuestion && window.location.pathname !== nextQuestion.url) {
            window.history.replaceState({ step: safeStep }, "", nextQuestion.url);
          }
        }

        function navigateToUrl(url) {
          const stepIndex = config.questions.findIndex((question) => question.url === url);

          if (stepIndex === -1) {
            window.location.href = url;
            return;
          }

          navigateToStep(stepIndex);
        }

        function replaceToUrl(url) {
          const stepIndex = config.questions.findIndex((question) => question.url === url);

          if (stepIndex === -1) {
            window.location.replace(url);
            return;
          }

          replaceToStep(stepIndex);
        }

        function getQuestion() {
          return config.questions[currentStep];
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

        function focusCurrentTextInput() {
          const input = steps[currentStep].querySelector(".text-input");
          if (!(input instanceof HTMLInputElement)) {
            return;
          }

          window.setTimeout(() => {
            input.focus({ preventScroll: true });
          }, 0);
        }

        function validateCurrentStep() {
          const question = getQuestion();
          const answer = getCurrentAnswer();

          if (question.kind === "interstitial") {
            return true;
          }

          if (!answer) {
            error.textContent = "Esta respuesta es requerida.";
            if (question.kind !== "choice") {
              focusCurrentTextInput();
            }
            return false;
          }

          if (question.type === "STATE") {
            const normalizedState = normalizeUsState(answer);

            if (!normalizedState) {
              error.textContent = "Ingrese un estado válido de Estados Unidos.";
              focusCurrentTextInput();
              return false;
            }

            answers[question.key] = normalizedState;
            error.textContent = "";
            return true;
          }

          if (question.type === "PHONE") {
            const normalizedPhone = normalizeUsPhoneNumber(answer);

            if (!normalizedPhone) {
              error.textContent = "Ingrese un número de teléfono válido de Estados Unidos.";
              focusCurrentTextInput();
              return false;
            }

            answers[question.key] = normalizedPhone;
            error.textContent = "";
            return true;
          }

          answers[question.key] = answer;
          error.textContent = "";
          return true;
        }

        async function saveCheckpoint(questionKey, answer) {
          if (config.previewMode) {
            answers[questionKey] = answer;
            return config.questions[currentStep]?.url;
          }

          const response = await fetch("/api/forms/" + encodeURIComponent(config.stateCode) + "/checkpoints", {
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

          return typeof body.nextUrl === "string" ? body.nextUrl : undefined;
        }

        async function checkpointCurrentStep() {
          const question = getQuestion();
          const answer = getCurrentAnswer();

          return saveCheckpoint(question.key, answer);
        }

        function getCoverageStateName() {
          const stateCode = String(answers.residence_state || config.stateCode).toUpperCase();
          const state = config.usStates.find((candidate) => candidate.code === stateCode);

          return state ? state.name : stateCode;
        }

        function formatMatchingBenefit(benefit) {
          return benefit.replace("{{stateName}}", getCoverageStateName());
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

        function renderMatchingBenefitContent(element, text, className) {
          element.replaceChildren();

          if (className !== "is-success") {
            element.textContent = text;
            return;
          }

          const successLines = text.split("\\n").filter((line) => line.trim());

          successLines.forEach((line) => {
            const lineElement = document.createElement("span");
            lineElement.className = "matching-success-line";
            lineElement.textContent = line;
            element.appendChild(lineElement);
          });
        }

        function showMatchingSuccess(question, elements, options = {}) {
          elements.status.textContent = "";
          setMatchingBenefitText(elements, question.successLabel, "is-success", options);
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
            error.textContent =
              checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar este paso.";
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

        function getStateSuggestions(value) {
          const trimmedValue = value.trim();

          if (!trimmedValue) {
            return [];
          }

          const normalizedValue = normalizeStateText(trimmedValue);
          const upperValue = trimmedValue.toUpperCase().replace(/\\./g, "");

          return config.usStates
            .filter((state) => {
              return (
                state.code.startsWith(upperValue) ||
                normalizeStateText(state.name).startsWith(normalizedValue) ||
                normalizeStateText(state.name).includes(" " + normalizedValue)
              );
            })
            .slice(0, 3);
        }

        function updateStateSuggestions(input) {
          const step = input.closest("[data-step]");
          const suggestions = step ? step.querySelector("[data-state-suggestions]") : undefined;

          if (!suggestions) {
            return;
          }

          const suggestedStates = getStateSuggestions(input.value);
          suggestions.replaceChildren(
            ...suggestedStates.map((state) => {
              const button = document.createElement("button");
              button.className = "state-suggestion";
              button.type = "button";
              button.dataset.stateSuggestion = state.code;
              button.dataset.stateName = state.name;
              button.innerHTML =
                "<span>" +
                state.name +
                "</span><span class=\\"state-suggestion-code\\">" +
                state.code +
                "</span>";

              return button;
            }),
          );
          suggestions.hidden = suggestedStates.length === 0;
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

        function isStateInputElement(value) {
          return value instanceof HTMLInputElement && value.dataset.stateInput === "true";
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
          if (
            !isMobileViewport() ||
            !isTextInputElement(target) ||
            isActionPointerDown ||
            isStateSuggestionPointerDown ||
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
          if (
            !isMobileViewport() ||
            !isTextInputElement(activeElement) ||
            isActionPointerDown ||
            isStateSuggestionPointerDown ||
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
            !target.closest("[data-state-suggestions]")
          );
        }

        function advanceAfterChoiceSelection(answer) {
          const question = getQuestion();
          if (question.kind !== "choice" || isSubmitting) {
            return;
          }

          clearAutoAdvance();
          answers[question.key] = answer;
          error.textContent = "";
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

                navigateToUrl(nextUrl ?? config.questions[getNextVisibleStepIndex()].url);
              } catch (checkpointError) {
                error.textContent =
                  checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar esta respuesta.";
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
          showStep(currentStep);

          try {
            const response = await fetch("/api/forms/" + encodeURIComponent(config.stateCode) + "/submissions", {
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
            error.textContent = submitError instanceof Error ? submitError.message : "No pudimos enviar el formulario.";
          } finally {
            isSubmitting = false;
            showStep(currentStep);
          }
        }

        async function handleNext() {
          clearAutoAdvance();

          const question = getQuestion();

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

              replaceToUrl(nextUrl ?? config.questions[getNextVisibleStepIndex()].url);
            } catch (checkpointError) {
              error.textContent =
                checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar este paso.";
            }
            return;
          }

          if (!validateCurrentStep()) {
            return;
          }

          try {
            const nextUrl = await checkpointCurrentStep();

            if (isCurrentStepFinal()) {
              await submitForm();
              return;
            }

            navigateToUrl(nextUrl ?? config.questions[getNextVisibleStepIndex()].url);
          } catch (checkpointError) {
            error.textContent =
              checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar esta respuesta.";
          }
        }

        nextButton.addEventListener("click", () => {
          void handleNext();
        });

        backButton.addEventListener("click", () => {
          clearAutoAdvance();
          navigateToStep(getPreviousVisibleStepIndex());
        });

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
          if (target instanceof HTMLElement && target.closest("[data-state-suggestion]")) {
            isStateSuggestionPointerDown = true;
          }
        });

        ["pointerup", "pointercancel"].forEach((eventName) => {
          window.addEventListener(eventName, () => {
            window.setTimeout(() => {
              isStateSuggestionPointerDown = false;
            }, 0);
          });
        });

        document.addEventListener("pointerdown", (event) => {
          if (shouldSubmitTextInputOnMobileOutsidePointer(event)) {
            nextButton.click();
          }
        });

        form.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) {
            return;
          }

          const suggestion = target.closest("[data-state-suggestion]");
          if (!(suggestion instanceof HTMLElement)) {
            return;
          }

          const step = suggestion.closest("[data-step]");
          const input = step ? step.querySelector("[data-state-input]") : undefined;
          if (!(input instanceof HTMLInputElement)) {
            return;
          }

          input.value = suggestion.dataset.stateName ?? suggestion.dataset.stateSuggestion ?? "";
          const suggestions = step?.querySelector("[data-state-suggestions]");
          if (suggestions instanceof HTMLElement) {
            suggestions.hidden = true;
          }

          nextButton.click();
        });

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
            if (isStateInputElement(target)) {
              updateStateSuggestions(target);
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

          if (isStateInputElement(target)) {
            updateStateSuggestions(target);
          }
        });

        form.addEventListener("focusout", (event) => {
          if (shouldSubmitTextInputOnMobileBlur(event)) {
            nextButton.click();
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
          selectChoiceByNumberKey(event);
        });

        window.addEventListener("popstate", () => {
          if (replaceHiddenMatchingRouteIfNeeded()) {
            return;
          }

          const stepIndex = getStepIndexForPath(window.location.pathname);

          if (stepIndex !== -1) {
            showStep(stepIndex);
            const currentQuestion = config.questions[currentStep];

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
          const question = config.questions[stepIndex];

          if (question && question.kind === "interstitial") {
            window.location.reload();
            return;
          }

          replaceHiddenMatchingRouteIfNeeded();
        });

        showStep(config.activeStepIndex);
        if (!replaceHiddenMatchingRouteIfNeeded()) {
          const currentQuestion = config.questions[currentStep];
          if (currentQuestion) {
            window.history.replaceState({ step: currentStep }, "", currentQuestion.url);
          }
        }
      })();
    </script>
  </body>
</html>`;
}

export function renderUnavailablePage(stateCode: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Formulario no disponible</title>
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

      a {
        color: var(--primary);
        font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main class="unavailable">
      <h1>No disponible.</h1>
      <p>El formulario para ${escapeHtml(stateCode.toUpperCase())} no está disponible en este momento. Puede volver al <a href="/tn">formulario de Tennessee</a>.</p>
    </main>
  </body>
</html>`;
}

function getVisibleStepIndexesForAnswers(form: InstantForm, answers: Record<string, string>): number[] {
  return form.questions
    .map((question, index) => (isServerQuestionVisible(question, answers) ? index : -1))
    .filter((index) => index !== -1);
}

function getCountedVisibleStepIndexesForAnswers(form: InstantForm, answers: Record<string, string>): number[] {
  return getVisibleStepIndexesForAnswers(form, answers).filter((index) => {
    const question = form.questions[index];

    return question ? isCountedStep(question) : false;
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

function renderQuestion(
  question: FormQuestion,
  index: number,
  stepCountLabel: string,
  activeStepIndex: number,
  answers: Record<string, string>,
): string {
  const isCurrent = index === activeStepIndex;
  const countsAsStep = isCountedStep(question);
  const stepCountAriaHidden = countsAsStep ? "" : ' aria-hidden="true"';

  return `<article class="step" data-step="${index}" data-step-kind="${escapeHtml(question.kind)}" data-step-counted="${String(countsAsStep)}" aria-hidden="${String(!isCurrent)}">
    <p class="step-count" data-step-count${stepCountAriaHidden}>${escapeHtml(stepCountLabel)}</p>
    <h1 class="question-title">${escapeHtml(question.label)}</h1>
    ${
      question.kind === "choice"
        ? renderOptions(question, answers)
        : question.kind === "state"
          ? renderStateInput(question, answers)
          : question.kind === "interstitial"
            ? renderInterstitial(question, answers)
            : renderTextInput(question, answers)
    }
  </article>`;
}

function renderInterstitial(question: InterstitialQuestion, answers: Record<string, string>): string {
  const answer = answers[question.key];
  const isComplete = answer === question.completionAnswer || answer === question.seenAnswer;
  const benefitClass = isComplete ? "matching-benefit is-success is-visible" : "matching-benefit";
  const benefitContent = isComplete
    ? question.successLabel
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => `<span class="matching-success-line">${escapeHtml(line)}</span>`)
        .join("")
    : escapeHtml(question.benefits[0] ?? "");

  return `<div class="matching-content">
    <p class="matching-status" data-matching-status></p>
    <p class="${benefitClass}" data-matching-benefit>${benefitContent}</p>
  </div>`;
}

function renderOptions(question: ChoiceQuestion, answers: Record<string, string>): string {
  const currentAnswer = answers[question.key];

  return `<div class="options">
    ${question.options
      .map(
        (option, index) => `<label class="option">
          <input type="radio" name="${escapeHtml(question.key)}" value="${escapeHtml(option.key)}"${
            currentAnswer === option.key ? " checked" : ""
          }>
          <span class="option-index">${index + 1}</span>
          <span class="option-text">${escapeHtml(option.value)}</span>
        </label>`,
      )
      .join("")}
  </div>`;
}

function renderTextInput(question: TextQuestion, answers: Record<string, string>): string {
  const inputType = question.type === "PHONE" ? "tel" : "text";
  const value = answers[question.key] ?? "";
  const placeholder = getInputPlaceholder(question);

  return `<input
    class="text-input"
    type="${inputType}"
    name="${escapeHtml(question.key)}"
    autocomplete="${escapeHtml(question.autocomplete)}"
    inputmode="${escapeHtml(question.inputMode)}"
    placeholder="${escapeHtml(placeholder)}"
    value="${escapeHtml(value)}"
  >`;
}

function renderStateInput(question: StateQuestion, answers: Record<string, string>): string {
  const value = answers[question.key] ?? "";
  const placeholder = getInputPlaceholder(question);

  return `<div class="state-field">
    <input
      class="text-input"
      type="text"
      name="${escapeHtml(question.key)}"
      autocomplete="${escapeHtml(question.autocomplete)}"
      inputmode="${escapeHtml(question.inputMode)}"
      placeholder="${escapeHtml(placeholder)}"
      value="${escapeHtml(value)}"
      data-state-input="true"
    >
    <div class="state-suggestions" data-state-suggestions hidden></div>
  </div>`;
}

function getInputPlaceholder(question: TextQuestion | StateQuestion): string {
  if (question.kind === "state") {
    return "Escriba su estado aquí";
  }

  if (question.type === "FIRST_NAME") {
    return "Escriba su nombre aquí";
  }

  if (question.type === "LAST_NAME") {
    return "Escriba su apellido aquí";
  }

  if (question.type === "PHONE") {
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
