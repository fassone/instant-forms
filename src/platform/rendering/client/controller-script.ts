import type { FormStep } from "../../flow";

export type ClientBehaviorKind = FormStep["kind"];

export type TransitionAssetPayload = {
  version: 1;
  route: string;
  steps: readonly unknown[];
  stepUrlsBySlug: Record<string, string>;
  usStates?: unknown;
  autocompleteSources?: unknown;
};

const allBehaviorKinds: readonly ClientBehaviorKind[] = [
  "choice",
  "text",
  "phone",
  "autocomplete",
  "interstitial",
  "trusted_form_consent",
];

export function getFormControllerScript(activeKind: ClientBehaviorKind): string {
  return `(() => {
${getCoreRuntimeScript()}
${getBehaviorModuleScript(activeKind, "registerBehaviorModule")}
  bootstrapInstantFormRuntime();
})();`;
}

export function getTransitionAssetScript(
  payload: TransitionAssetPayload,
  transformModuleScript: (script: string) => string = (script) => script,
): string {
  const payloadJson = JSON.stringify(payload);
  const moduleScripts = allBehaviorKinds
    .map((kind) => transformModuleScript(getBehaviorModuleScript(kind, "runtime.registerBehaviorModule")))
    .join("\n");

  return `(() => {
  const runtime = window.__INSTANT_FORM_RUNTIME__;
  if (!runtime) {
    return;
  }
${moduleScripts}
  runtime.registerTransitionAsset(${payloadJson});
})();\n`;
}

function getCoreRuntimeScript(): string {
  return `
  const config = window.__FORM_CONFIG__;
  const form = document.getElementById("lead-form");
  const thanks = document.getElementById("thanks");
  const stepsContainer = document.getElementById("steps");
  let steps = Array.from(document.querySelectorAll("[data-step]"));
  const progressBar = document.getElementById("progress-bar");
  const stepCount = document.querySelector("[data-step-count]");
  const backButton = document.getElementById("back-button");
  const nextButton = document.getElementById("next-button");
  const actions = document.querySelector(".actions");
  const errorModal = document.getElementById("error-modal");
  const errorModalMessage = document.getElementById("error-modal-message");
  const errorModalClose = document.getElementById("error-modal-close");
  const answers = { ...config.initialAnswers };
  const behaviorModules = {};
  const transitionAssetWaitBudgetMs = 160;
  let currentStep = config.activeStepIndex;
  let mountedStepIndex = -1;
  let mountedBehavior;
  let mountedCleanup;
  let isSubmitting = false;
  let isActionPointerDown = false;
  let errorModalReturnFocusTarget;
  let transitionAssetLoaded = false;
  let transitionAssetPromise;
  let checkpointQueue = Promise.resolve();
  let checkpointQueueError;
  let checkpointQueueFailedQuestionKey;

  function registerBehaviorModule(kind, module) {
    behaviorModules[kind] = module;
  }

  function registerTransitionAsset(asset) {
    if (!asset || !Array.isArray(asset.steps)) {
      return;
    }

    const currentQuestion = getQuestion();
    const currentPath = window.location.pathname;
    const currentDraftAnswer = currentQuestion ? getCurrentAnswer() : "";
    config.steps = asset.steps.map((step) => step.config);
    config.stepUrlsBySlug = asset.stepUrlsBySlug || config.stepUrlsBySlug;
    if (asset.usStates) {
      config.usStates = asset.usStates;
    }
    if (asset.autocompleteSources) {
      config.autocompleteSources = asset.autocompleteSources;
    }
    if (stepsContainer) {
      stepsContainer.innerHTML = asset.steps.map((step) => step.html).join("");
      steps = Array.from(document.querySelectorAll("[data-step]"));
    }
    transitionAssetLoaded = true;

    const pathStepIndex = getStepIndexForPath(currentPath);
    const keyStepIndex = config.steps.findIndex((question) => question.key === currentQuestion?.key);
    currentStep = pathStepIndex !== -1 ? pathStepIndex : keyStepIndex !== -1 ? keyStepIndex : 0;
    mountedStepIndex = -1;
    showStep(currentStep);
    restoreStepDraft(currentQuestion, currentDraftAnswer);
  }

  window.__INSTANT_FORM_RUNTIME__ = {
    registerBehaviorModule,
    registerTransitionAsset,
  };

  function getContext() {
    return {
      answers,
      config,
      form,
      thanks,
      steps,
      get currentStep() {
        return currentStep;
      },
      get isSubmitting() {
        return isSubmitting;
      },
      get isActionPointerDown() {
        return isActionPointerDown;
      },
      advanceOptimistically,
      setSubmitting,
      getQuestion,
      getStepElement,
      getRenderedNextUrl,
      getNextVisibleStepIndex,
      getPathname,
      handleNext,
      hideErrorModal,
      isCurrentStepFinal,
      isMobileViewport,
      isTextInputElement,
      isTypingTarget,
      navigateToUrl,
      queueCheckpoint,
      replaceToUrl,
      saveCheckpoint,
      showErrorModal,
      showStep,
      submitForm,
      updateNextButton,
    };
  }

  function bootstrapInstantFormRuntime() {
    nextButton.addEventListener("click", () => {
      void handleNext();
    });

    backButton.addEventListener("click", () => {
      const activeBehavior = getActiveBehavior();
      activeBehavior?.beforeBack?.(getContext(), getQuestion(), getStepElement());
      const previousUrl = getRenderedPreviousUrl();
      if (previousUrl) {
        navigateToUrl(previousUrl);
      }
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

    document.addEventListener("pointerdown", (event) => {
      getActiveBehavior()?.onDocumentPointerDown?.(event, getContext(), getQuestion(), getStepElement());
    });

    form.addEventListener("click", (event) => {
      getActiveBehavior()?.onClick?.(event, getContext(), getQuestion(), getStepElement());
    });

    form.addEventListener(
      "scroll",
      (event) => {
        getActiveBehavior()?.onScroll?.(event, getContext(), getQuestion(), getStepElement());
      },
      true,
    );

    form.addEventListener("beforeinput", (event) => {
      getActiveBehavior()?.onBeforeInput?.(event, getContext(), getQuestion(), getStepElement());
    });

    form.addEventListener("input", (event) => {
      getActiveBehavior()?.onInput?.(event, getContext(), getQuestion(), getStepElement());
    });

    form.addEventListener("focusin", (event) => {
      getActiveBehavior()?.onFocusIn?.(event, getContext(), getQuestion(), getStepElement());
    });

    form.addEventListener("focusout", (event) => {
      getActiveBehavior()?.onFocusOut?.(event, getContext(), getQuestion(), getStepElement());
    });

    form.addEventListener("change", (event) => {
      getActiveBehavior()?.onChange?.(event, getContext(), getQuestion(), getStepElement());
    });

    form.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        nextButton.click();
        return;
      }

      getActiveBehavior()?.onKeyDown?.(event, getContext(), getQuestion(), getStepElement());
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && errorModal && !errorModal.hidden) {
        event.preventDefault();
        hideErrorModal();
        return;
      }

      getActiveBehavior()?.onDocumentKeyDown?.(event, getContext(), getQuestion(), getStepElement());
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
    preloadTransitionAsset();
    if (!replaceHiddenMatchingRouteIfNeeded()) {
      const currentQuestion = config.steps[currentStep];
      if (currentQuestion) {
        window.history.replaceState({ step: currentStep }, "", currentQuestion.url);
      }
    }
  }

  function showStep(nextStep) {
    const previousBehavior = mountedBehavior;
    if (mountedStepIndex !== -1 && mountedStepIndex !== nextStep) {
      mountedCleanup?.();
      previousBehavior?.unmount?.(getContext(), getQuestion(), getStepElement());
      mountedCleanup = undefined;
      mountedBehavior = undefined;
      mountedStepIndex = -1;
    }

    const requestedStep = Math.max(0, Math.min(nextStep, steps.length - 1));
    currentStep = requestedStep;
    const question = getQuestion();
    const countedStepNumber = getRenderedCountedStepNumber();
    const countedStepCount = getRenderedCountedStepCount();
    config.currentStep = question;

    steps.forEach((step, index) => {
      step.setAttribute("aria-hidden", String(index !== currentStep));
    });

    form.dataset.activeKind = question.kind;
    if (stepCount) {
      stepCount.textContent = "Paso " + countedStepNumber + " de " + countedStepCount;
      stepCount.setAttribute("aria-hidden", String(!question.countsAsStep));
    }

    progressBar.style.width = (countedStepNumber / countedStepCount) * 100 + "%";
    hideErrorModal();
    hydrateCurrentStepAnswer(question);
    updateNextButton();
    mountCurrentBehavior();
  }

  function mountCurrentBehavior() {
    if (mountedStepIndex === currentStep) {
      return;
    }

    const question = getQuestion();
    const behavior = getActiveBehavior();
    mountedBehavior = behavior;
    mountedStepIndex = currentStep;
    mountedCleanup = behavior?.mount?.(getContext(), question, getStepElement());
  }

  function updateNextButton(labelOverride, disabledOverride) {
    const question = getQuestion();
    const behavior = getActiveBehavior();
    nextButton.textContent = labelOverride ?? behavior?.getNextLabel?.(getContext(), question, getStepElement()) ?? (isCurrentStepFinal() ? "Enviar" : "Siguiente");
    nextButton.disabled = disabledOverride ?? (isSubmitting || Boolean(behavior?.isNextDisabled?.(getContext(), question, getStepElement())));
    backButton.disabled = !getRenderedPreviousUrl() || isSubmitting;
  }

  function getActiveBehavior() {
    return behaviorModules[getQuestion()?.kind];
  }

  function getQuestion() {
    return config.steps[currentStep];
  }

  function getStepElement() {
    return steps[currentStep];
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

  function getCountedVisibleStepIndexes() {
    return getVisibleStepIndexes().filter((stepIndex) => {
      const question = config.steps[stepIndex];
      return question && question.countsAsStep !== false;
    });
  }

  function getRenderedCountedStepNumber() {
    if (!hasFullStepContext()) {
      return config.countedStepNumber;
    }

    const countedStepIndexes = getCountedVisibleStepIndexes();
    if (countedStepIndexes.length === 0) {
      return 1;
    }

    const countedStepsThroughCurrent = countedStepIndexes.filter((stepIndex) => stepIndex <= currentStep).length;
    return Math.max(countedStepsThroughCurrent, 1);
  }

  function getRenderedCountedStepCount() {
    return hasFullStepContext() ? Math.max(getCountedVisibleStepIndexes().length, 1) : config.countedStepCount;
  }

  function hasFullStepContext() {
    return transitionAssetLoaded && config.steps.length > 1;
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
    const behavior = behaviorModules[question.kind];
    if (behavior?.isAnswered) {
      return behavior.isAnswered(getContext(), question, answers[question.key]);
    }

    return Boolean(answers[question.key]);
  }

  function isCurrentStepFinal() {
    if (!hasFullStepContext()) {
      return config.isFinalStep;
    }

    const visibleStepIndexes = getVisibleStepIndexes();
    return getCurrentVisiblePosition() === visibleStepIndexes.length - 1;
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

  function getRenderedPreviousUrl() {
    if (!hasFullStepContext()) {
      return config.previousUrl;
    }

    const previousStepIndex = getVisibleStepIndexes()[getCurrentVisiblePosition() - 1];
    return previousStepIndex === undefined ? undefined : config.steps[previousStepIndex]?.url;
  }

  function getRenderedNextUrl() {
    if (!hasFullStepContext()) {
      return config.nextUrl;
    }

    const nextStepIndex = getVisibleStepIndexes()[getCurrentVisiblePosition() + 1];
    return nextStepIndex === undefined ? undefined : config.steps[nextStepIndex]?.url;
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

  function preloadTransitionAsset() {
    if (!config.transitionAssetUrl || config.previewMode) {
      return;
    }

    void loadTransitionAsset();
  }

  function loadTransitionAsset() {
    if (transitionAssetLoaded) {
      return Promise.resolve();
    }

    if (transitionAssetPromise) {
      return transitionAssetPromise;
    }

    transitionAssetPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = true;
      script.src = config.transitionAssetUrl;
      script.dataset.instantFormTransition = "true";
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => {
        transitionAssetPromise = undefined;
        script.remove();
        resolve();
      }, { once: true });
      document.head.appendChild(script);
    });

    return transitionAssetPromise;
  }

  async function waitForTransitionAssetBudget() {
    if (transitionAssetLoaded) {
      return true;
    }

    if (!config.transitionAssetUrl || config.previewMode) {
      return false;
    }

    const timeoutPromise = new Promise((resolve) => {
      window.setTimeout(() => resolve(false), transitionAssetWaitBudgetMs);
    });

    return Boolean(await Promise.race([loadTransitionAsset().then(() => transitionAssetLoaded), timeoutPromise]));
  }

  function navigateWithTransitionAsset(url, mode) {
    if (!transitionAssetLoaded) {
      return false;
    }

    const nextPath = getPathname(url);
    const stepIndex = getStepIndexForPath(nextPath);
    if (stepIndex === -1 || !canRenderStepFromTransitionAsset(stepIndex)) {
      return false;
    }

    showStep(stepIndex);
    if (window.location.pathname !== nextPath) {
      if (mode === "replace") {
        window.history.replaceState({ step: stepIndex }, "", nextPath);
      } else {
        window.history.pushState({ step: stepIndex }, "", nextPath);
      }
    }

    return true;
  }

  function canRenderStepFromTransitionAsset(stepIndex) {
    const question = config.steps[stepIndex];
    return Boolean(question) && isQuestionVisible(question);
  }

  function navigateToStep(nextStep) {
    const safeStep = Math.max(0, Math.min(nextStep, steps.length - 1));
    const nextQuestion = config.steps[safeStep];
    if (safeStep !== currentStep && nextQuestion) {
      if (navigateWithTransitionAsset(nextQuestion.url, "push")) {
        return;
      }

      window.location.href = nextQuestion.url;
      return;
    }

    showStep(safeStep);
  }

  function replaceToStep(nextStep) {
    const safeStep = Math.max(0, Math.min(nextStep, steps.length - 1));
    const nextQuestion = config.steps[safeStep];
    if (safeStep !== currentStep && nextQuestion) {
      if (navigateWithTransitionAsset(nextQuestion.url, "replace")) {
        return;
      }

      window.location.replace(nextQuestion.url);
      return;
    }

    showStep(safeStep);
  }

  function navigateToUrl(url) {
    if (navigateWithTransitionAsset(url, "push")) {
      return;
    }

    const stepIndex = config.steps.findIndex((question) => question.url === url);
    if (stepIndex === -1) {
      window.location.href = url;
      return;
    }

    navigateToStep(stepIndex);
  }

  function replaceToUrl(url) {
    if (navigateWithTransitionAsset(url, "replace")) {
      return;
    }

    const stepIndex = config.steps.findIndex((question) => question.url === url);
    if (stepIndex === -1) {
      window.location.replace(url);
      return;
    }

    replaceToStep(stepIndex);
  }

  function getPathname(url) {
    try {
      return new URL(url, window.location.origin).pathname;
    } catch {
      return url;
    }
  }

  function hydrateCurrentStepAnswer(question) {
    const answer = answers[question.key];
    if (!answer && question.kind !== "trusted_form_consent") {
      return;
    }

    getActiveBehavior()?.hydrate?.(getContext(), question, getStepElement(), answer);
  }

  function getCurrentAnswer() {
    const behavior = getActiveBehavior();
    if (behavior?.getAnswer) {
      return behavior.getAnswer(getContext(), getQuestion(), getStepElement());
    }

    const input = getStepElement().querySelector("input");
    return input ? input.value.trim() : "";
  }

  function restoreStepDraft(previousQuestion, draftAnswer) {
    if (!previousQuestion || previousQuestion.key !== getQuestion()?.key || !draftAnswer || answers[previousQuestion.key]) {
      return;
    }

    const step = getStepElement();
    const input = step.querySelector("input");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (input.type === "radio") {
      const matchingInput = step.querySelector('input[type="radio"][value="' + CSS.escape(draftAnswer) + '"]');
      if (matchingInput instanceof HTMLInputElement) {
        matchingInput.checked = true;
      }
      return;
    }

    input.value = draftAnswer;
  }

  function validateCurrentStep(options = {}) {
    const behavior = getActiveBehavior();
    if (behavior?.validate) {
      return behavior.validate(getContext(), getQuestion(), getStepElement(), options);
    }

    const answer = getCurrentAnswer();
    if (!answer) {
      showErrorModal("Esta respuesta es requerida.", { returnFocusTarget: getValidationErrorReturnFocusTarget(options.focusInvalid !== false) });
      return false;
    }

    answers[getQuestion().key] = answer;
    hideErrorModal();
    return true;
  }

  function getValidationErrorReturnFocusTarget(shouldFocusInvalid) {
    return shouldFocusInvalid ? getCurrentTextInput() : nextButton;
  }

  function getCurrentTextInput() {
    const input = getStepElement().querySelector(".text-input");
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
    const returnFocusTarget = errorModalReturnFocusTarget instanceof HTMLElement ? errorModalReturnFocusTarget : nextButton;
    errorModalReturnFocusTarget = undefined;
    window.setTimeout(() => {
      if (document.body.contains(returnFocusTarget)) {
        returnFocusTarget.focus({ preventScroll: true });
      }
    }, 0);
  }

  async function writeCheckpointNow(questionKey, answer) {
    if (config.previewMode) {
      answers[questionKey] = answer;
      return config.steps[currentStep]?.url;
    }

    const response = await fetch("/api/forms/" + encodeURIComponent(config.routeKey) + "/checkpoints", {
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
      Object.assign(answers, body.answers);
    }

    return typeof body.nextUrl === "string" ? getRouteAwareNextUrl(body.nextUrl) : undefined;
  }

  function saveCheckpoint(questionKey, answer) {
    return queueCheckpoint(questionKey, answer, { reconcile: false });
  }

  function queueCheckpoint(questionKey, answer, options = {}) {
    if (config.previewMode) {
      answers[questionKey] = answer;
      return Promise.resolve(options.predictedUrl ?? config.steps[currentStep]?.url);
    }

    const checkpointTask = checkpointQueue.then(() => writeCheckpointNow(questionKey, answer));
    checkpointQueue = checkpointTask.catch(() => undefined);

    return checkpointTask.then((nextUrl) => {
      if (checkpointQueueFailedQuestionKey === questionKey) {
        checkpointQueueError = undefined;
        checkpointQueueFailedQuestionKey = undefined;
      }
      reconcileCheckpointSuccess(nextUrl, options);
      return nextUrl;
    }).catch((checkpointError) => {
      checkpointQueueError = checkpointError;
      checkpointQueueFailedQuestionKey = questionKey;
      reconcileCheckpointFailure(checkpointError, options);
      throw checkpointError;
    });
  }

  async function waitForPendingCheckpoints() {
    await checkpointQueue;
    if (checkpointQueueError) {
      throw checkpointQueueError;
    }
  }

  function reconcileCheckpointSuccess(nextUrl, options = {}) {
    if (options.reconcile === false || !nextUrl || !options.predictedUrl) {
      return;
    }

    const approvedPath = getPathname(nextUrl);
    const predictedPath = getPathname(options.predictedUrl);
    if (approvedPath === predictedPath || window.location.pathname !== predictedPath) {
      return;
    }

    if (options.mode === "replace") {
      replaceToUrl(nextUrl);
      return;
    }

    navigateToUrl(nextUrl);
  }

  function reconcileCheckpointFailure(error, options = {}) {
    if (options.reconcile === false) {
      return;
    }

    const message = error instanceof Error ? error.message : "No pudimos guardar esta respuesta.";
    if (options.stepUrl) {
      replaceToUrl(options.stepUrl);
    }
    showErrorModal(message);
  }

  function getRouteAwareNextUrl(nextUrl) {
    const nextPath = getPathname(nextUrl);
    const directStep = config.steps.find((question) => question.url === nextPath);
    if (directStep) {
      return directStep.url;
    }

    const nextPathSegments = nextPath.split("/").filter(Boolean);
    const nextSlug = nextPathSegments[nextPathSegments.length - 1];
    const matchingStepUrl = nextSlug ? config.stepUrlsBySlug[nextSlug] : undefined;
    return matchingStepUrl ?? nextUrl;
  }

  async function submitForm() {
    isSubmitting = true;
    let submitErrorMessage;
    updateNextButton();

    try {
      await waitForPendingCheckpoints();
      const behavior = getActiveBehavior();
      const submitMetadata = behavior?.beforeSubmit ? await behavior.beforeSubmit(getContext(), getQuestion(), getStepElement()) : {};
      const response = await fetch("/api/forms/" + encodeURIComponent(config.routeKey) + "/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, ...submitMetadata }),
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
      updateNextButton();
    }

    if (submitErrorMessage) {
      showErrorModal(submitErrorMessage);
    }
  }

  async function handleNext(options = {}) {
    const behavior = getActiveBehavior();
    const question = getQuestion();
    const handled = await behavior?.onNext?.(getContext(), question, getStepElement(), options);
    if (handled) {
      return;
    }

    const shouldFocusInvalid = options.focusInvalid ?? !isMobileViewport();
    if (!validateCurrentStep({ focusInvalid: shouldFocusInvalid })) {
      return;
    }

    await advanceOptimistically(question, answers[question.key] ?? getCurrentAnswer());
  }

  async function advanceOptimistically(question, answer, options = {}) {
    answers[question.key] = answer;
    const stepUrl = question.url;
    const mode = options.mode ?? "push";
    const isFinal = isCurrentStepFinal();

    if (isFinal) {
      try {
        await queueCheckpoint(question.key, answer, { stepUrl, reconcile: false });
        await submitForm();
      } catch (checkpointError) {
        reconcileCheckpointFailure(checkpointError, { stepUrl });
      }
      return;
    }

    const assetReady = await waitForTransitionAssetBudget();
    const predictedUrl = getRenderedNextUrl() ?? config.steps[getNextVisibleStepIndex()]?.url;

    if (!predictedUrl) {
      return;
    }

    if (assetReady && navigateWithTransitionAsset(predictedUrl, mode)) {
      void queueCheckpoint(question.key, answer, { stepUrl, predictedUrl, mode }).catch(() => undefined);
      return;
    }

    try {
      const nextUrl = await queueCheckpoint(question.key, answer, { stepUrl, predictedUrl, mode, reconcile: false });
      navigateToUrl(nextUrl ?? predictedUrl);
    } catch (checkpointError) {
      showErrorModal(checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar esta respuesta.");
    }
  }

  function setSubmitting(nextSubmitting) {
    isSubmitting = nextSubmitting;
    updateNextButton();
  }

  function isTextInputElement(value) {
    return value instanceof HTMLInputElement && value.classList.contains("text-input");
  }

  function isTypingTarget(value) {
    if (value instanceof HTMLInputElement) {
      return ["email", "number", "password", "search", "tel", "text", "url"].includes(value.type);
    }

    return value instanceof HTMLTextAreaElement || value instanceof HTMLSelectElement || (value instanceof HTMLElement && value.isContentEditable);
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 560px)").matches;
  }
`;
}

function getBehaviorModuleScript(kind: ClientBehaviorKind, registerExpression: string): string {
  const scripts: Record<ClientBehaviorKind, string> = {
    choice: getChoiceBehaviorScript(registerExpression),
    text: getTextBehaviorScript(registerExpression),
    phone: getPhoneBehaviorScript(registerExpression),
    autocomplete: getAutocompleteBehaviorScript(registerExpression),
    interstitial: getInterstitialBehaviorScript(registerExpression),
    trusted_form_consent: getTrustedFormBehaviorScript(registerExpression),
  };

  return scripts[kind];
}

function getChoiceBehaviorScript(registerExpression: string): string {
  return `
  ${registerExpression}("choice", (() => {
    let autoAdvanceTimer;

    function clearAutoAdvance() {
      if (autoAdvanceTimer) {
        window.clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = undefined;
      }
    }

    function getAnswer(_ctx, question, step) {
      const checked = step.querySelector("input[type='radio']:checked");
      return checked ? checked.value : "";
    }

    function hydrate(_ctx, _question, step, answer) {
      Array.from(step.querySelectorAll("input[type='radio']")).forEach((input) => {
        if (input instanceof HTMLInputElement) {
          input.checked = input.value === answer;
        }
      });
    }

    function validate(ctx, question, step) {
      const answer = getAnswer(ctx, question, step);
      if (!answer) {
        ctx.showErrorModal("Esta respuesta es requerida.");
        return false;
      }

      ctx.answers[question.key] = answer;
      ctx.hideErrorModal();
      return true;
    }

    function advanceAfterChoiceSelection(ctx, question, answer) {
      if (ctx.isSubmitting) {
        return;
      }

      clearAutoAdvance();
      ctx.answers[question.key] = answer;
      ctx.hideErrorModal();
      const selectedStep = ctx.currentStep;
      autoAdvanceTimer = window.setTimeout(() => {
        autoAdvanceTimer = undefined;
        if (ctx.currentStep !== selectedStep) {
          return;
        }

        void (async () => {
          await ctx.advanceOptimistically(question, answer);
        })();
      }, 180);
    }

    function getClickedChoiceInput(target, step) {
      if (!(target instanceof HTMLElement)) {
        return undefined;
      }

      const option = target.closest(".option");
      if (!(option instanceof HTMLElement) || !step.contains(option)) {
        return undefined;
      }

      const input = option.querySelector("input[type='radio']");
      return input instanceof HTMLInputElement ? input : undefined;
    }

    return {
      getAnswer,
      hydrate,
      validate,
      unmount: clearAutoAdvance,
      beforeBack: clearAutoAdvance,
      onClick(event, ctx, question, step) {
        const input = getClickedChoiceInput(event.target, step);
        if (!input || !input.checked) {
          return;
        }
        advanceAfterChoiceSelection(ctx, question, input.value);
      },
      onChange(event, ctx, question) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== "radio" || !target.checked) {
          return;
        }
        advanceAfterChoiceSelection(ctx, question, target.value);
      },
      onDocumentKeyDown(event, ctx, question, step) {
        if (event.defaultPrevented || ctx.isTypingTarget(event.target)) {
          return false;
        }
        if (!/^[1-9]$/.test(event.key)) {
          return false;
        }

        const optionIndex = Number(event.key) - 1;
        const optionKey = question.options[optionIndex];
        if (!optionKey) {
          return false;
        }

        const option = Array.from(step.querySelectorAll("input[type='radio']")).find((input) => input.value === optionKey);
        if (!(option instanceof HTMLInputElement)) {
          return false;
        }

        event.preventDefault();
        option.checked = true;
        advanceAfterChoiceSelection(ctx, question, option.value);
        return true;
      },
    };
  })());
`;
}

function getTextBehaviorScript(registerExpression: string): string {
  return `
  ${registerExpression}("text", (() => {
    let focusedTextInput;

    function getAnswer(_ctx, _question, step) {
      const input = step.querySelector("input");
      return input ? input.value.trim() : "";
    }

    function hydrate(_ctx, _question, step, answer) {
      const input = step.querySelector("input");
      if (input instanceof HTMLInputElement && !input.value) {
        input.value = answer ?? "";
      }
    }

    function validate(ctx, question, step, options = {}) {
      const answer = getAnswer(ctx, question, step);
      if (!answer) {
        const returnFocusTarget = options.focusInvalid !== false ? step.querySelector(".text-input") : undefined;
        ctx.showErrorModal("Esta respuesta es requerida.", { returnFocusTarget });
        return false;
      }
      ctx.answers[question.key] = answer;
      ctx.hideErrorModal();
      return true;
    }

    function shouldSubmitTextInputOnMobileBlur(event, ctx, question, step) {
      const target = event.target;
      return Boolean(ctx.isMobileViewport() && ctx.isTextInputElement(target) && question.behavior.mobileBlurSubmit && !ctx.isActionPointerDown && !ctx.isSubmitting && step.contains(target));
    }

    function shouldSubmitTextInputOnMobileOutsidePointer(event, ctx, question, step) {
      const activeElement = ctx.isTextInputElement(document.activeElement) ? document.activeElement : focusedTextInput;
      const target = event.target;
      if (!ctx.isMobileViewport() || !ctx.isTextInputElement(activeElement) || !question.behavior.mobileBlurSubmit || ctx.isActionPointerDown || ctx.isSubmitting) {
        return false;
      }
      if (!step.contains(activeElement) || !(target instanceof HTMLElement)) {
        return false;
      }
      return target !== activeElement && !target.closest(".text-input") && !target.closest(".actions") && !target.closest("[data-autocomplete-suggestions-shell]");
    }

    return {
      getAnswer,
      hydrate,
      validate,
      onFocusIn(event, ctx) {
        const target = event.target;
        if (ctx.isTextInputElement(target)) {
          focusedTextInput = target;
        }
      },
      onFocusOut(event, ctx, question, step) {
        if (shouldSubmitTextInputOnMobileBlur(event, ctx, question, step) && validate(ctx, question, step, { focusInvalid: false })) {
          void ctx.advanceOptimistically(question, ctx.answers[question.key] ?? getAnswer(ctx, question, step));
        }
        if (event.target === focusedTextInput) {
          focusedTextInput = undefined;
        }
      },
      onDocumentPointerDown(event, ctx, question, step) {
        if (shouldSubmitTextInputOnMobileOutsidePointer(event, ctx, question, step) && validate(ctx, question, step, { focusInvalid: false })) {
          void ctx.advanceOptimistically(question, ctx.answers[question.key] ?? getAnswer(ctx, question, step));
        }
      },
    };
  })());
`;
}

function getPhoneBehaviorScript(registerExpression: string): string {
  return `
  ${registerExpression}("phone", (() => {
    let focusedTextInput;

    function getAnswer(_ctx, _question, step) {
      const input = step.querySelector("input");
      return input ? input.value.trim() : "";
    }

    function hydrate(_ctx, _question, step, answer) {
      const input = step.querySelector("input");
      if (input instanceof HTMLInputElement && !input.value) {
        input.value = formatUsPhoneForDisplay(answer ?? "");
      }
    }

    function validate(ctx, question, step, options = {}) {
      const normalizedPhone = normalizeUsPhoneNumber(getAnswer(ctx, question, step));
      if (!normalizedPhone) {
        const returnFocusTarget = options.focusInvalid !== false ? step.querySelector(".text-input") : undefined;
        ctx.showErrorModal("Ingrese un número de teléfono válido de Estados Unidos.", { returnFocusTarget });
        return false;
      }
      ctx.answers[question.key] = normalizedPhone;
      ctx.hideErrorModal();
      return true;
    }

    function parseUsPhoneInput(value) {
      const trimmedValue = value.trim();
      const digitsOnly = value.replace(/\\D/g, "");
      const startsWithPlus = trimmedValue.startsWith("+");
      const hasPlusUsPrefix = startsWithPlus && digitsOnly.startsWith("1");
      const hasPlainUsPrefix = !startsWithPlus && trimmedValue.startsWith("1") && digitsOnly.startsWith("1");
      if (startsWithPlus && digitsOnly.length > 0 && !hasPlusUsPrefix) {
        return { kind: "unsupported", prefix: "", nationalDigits: "", digitsOnly };
      }
      const prefix = hasPlusUsPrefix ? "+1" : hasPlainUsPrefix ? "1" : "";
      const nationalDigits = prefix ? digitsOnly.slice(1, 11) : digitsOnly.slice(0, 10);
      return { kind: "us", prefix, nationalDigits, digitsOnly };
    }

    function normalizeUsPhoneNumber(value) {
      const parsedPhone = parseUsPhoneInput(value);
      if (parsedPhone.kind !== "us" || parsedPhone.nationalDigits.length !== 10) {
        return undefined;
      }
      return "+1" + parsedPhone.nationalDigits;
    }

    function formatUsPhoneForDisplay(value) {
      const parsedPhone = parseUsPhoneInput(value);
      if (isUnsupportedInternationalPhone(value)) {
        return value;
      }
      const trimmedValue = value.trim();
      if (trimmedValue.startsWith("+") && parsedPhone.digitsOnly.length === 0) {
        return value;
      }
      const formattedNationalPhone = formatNationalPhoneDigits(parsedPhone.nationalDigits);
      return parsedPhone.prefix ? (formattedNationalPhone ? parsedPhone.prefix + " " + formattedNationalPhone : parsedPhone.prefix) : formattedNationalPhone;
    }

    function isUnsupportedInternationalPhone(value) {
      return parseUsPhoneInput(value).kind === "unsupported";
    }

    function formatNationalPhoneDigits(digits) {
      if (digits.length === 0) return "";
      if (digits.length <= 3) return "(" + digits;
      if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
      return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6, 10);
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
      if (!(target instanceof HTMLInputElement) || target.type !== "tel") {
        return false;
      }
      const parsedPhone = parseUsPhoneInput(target.value);
      if (parsedPhone.kind !== "us" || parsedPhone.nationalDigits.length < 10) {
        return false;
      }
      const selectionStart = target.selectionStart ?? target.value.length;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      if (selectionStart !== selectionEnd || event.inputType?.startsWith("delete")) {
        return false;
      }
      const inputData = event.data ?? "";
      return event.inputType === "insertFromPaste" || /[\\d()+.\\-\\s]/.test(inputData);
    }

    function shouldSubmitOnMobileBlur(event, ctx, question, step) {
      const target = event.target;
      return Boolean(ctx.isMobileViewport() && ctx.isTextInputElement(target) && question.behavior.mobileBlurSubmit && !ctx.isActionPointerDown && !ctx.isSubmitting && step.contains(target));
    }

    function submitIfValid(ctx, question, step) {
      if (!validate(ctx, question, step, { focusInvalid: false })) {
        return;
      }
      void ctx.advanceOptimistically(question, ctx.answers[question.key] ?? getAnswer(ctx, question, step));
    }

    return {
      getAnswer,
      hydrate,
      validate,
      onBeforeInput(event) {
        if (shouldBlockExtraPhoneInput(event)) {
          event.preventDefault();
        }
      },
      onInput(event, ctx) {
        const target = event.target;
        if (ctx.isTextInputElement(target)) {
          focusedTextInput = target;
        }
        if (target instanceof HTMLInputElement && target.type === "tel") {
          handlePhoneInput(target);
        }
      },
      onFocusIn(event, ctx) {
        const target = event.target;
        if (ctx.isTextInputElement(target)) {
          focusedTextInput = target;
        }
      },
      onFocusOut(event, ctx, question, step) {
        if (shouldSubmitOnMobileBlur(event, ctx, question, step)) {
          submitIfValid(ctx, question, step);
        }
        if (event.target === focusedTextInput) {
          focusedTextInput = undefined;
        }
      },
      onDocumentPointerDown(event, ctx, question, step) {
        const activeElement = ctx.isTextInputElement(document.activeElement) ? document.activeElement : focusedTextInput;
        const target = event.target;
        if (!ctx.isMobileViewport() || !ctx.isTextInputElement(activeElement) || !question.behavior.mobileBlurSubmit || ctx.isActionPointerDown || ctx.isSubmitting) return;
        if (!step.contains(activeElement) || !(target instanceof HTMLElement)) return;
        if (target !== activeElement && !target.closest(".text-input") && !target.closest(".actions") && !target.closest("[data-autocomplete-suggestions-shell]")) {
          submitIfValid(ctx, question, step);
        }
      },
    };
  })());
`;
}

function getAutocompleteBehaviorScript(registerExpression: string): string {
  return `
  ${registerExpression}("autocomplete", (() => {
    function getAnswer(_ctx, _question, step) {
      const input = step.querySelector("input");
      return input ? input.value.trim() : "";
    }

    function hydrate(ctx, question, step, answer) {
      const input = step.querySelector("input");
      if (input instanceof HTMLInputElement && !input.value) {
        input.value = getAutocompleteDisplayValue(ctx, question, answer ?? "");
      }
    }

    function validate(ctx, question, step, options = {}) {
      const normalizedState = normalizeUsState(ctx, getAnswer(ctx, question, step));
      if (!normalizedState) {
        const returnFocusTarget = options.focusInvalid !== false ? step.querySelector(".text-input") : undefined;
        ctx.showErrorModal(question.validationMessage || "Ingrese un estado válido de Estados Unidos.", { returnFocusTarget });
        return false;
      }
      ctx.answers[question.key] = normalizedState;
      ctx.hideErrorModal();
      return true;
    }

    function normalizeUsState(ctx, value) {
      const trimmedValue = value.trim();
      if (!trimmedValue) return undefined;
      const upperValue = trimmedValue.toUpperCase().replace(/\\./g, "");
      const stateByCode = (ctx.config?.usStates ?? window.__FORM_CONFIG__.usStates ?? []).find((state) => state.code === upperValue);
      if (stateByCode) return stateByCode.code;
      const normalizedValue = normalizeStateText(trimmedValue);
      const stateByName = (window.__FORM_CONFIG__.usStates ?? []).find((state) => normalizeStateText(state.name) === normalizedValue);
      if (stateByName) return stateByName.code;
      if (["washington dc", "washington d c", "dc", "d c"].includes(normalizedValue)) return "DC";
      return undefined;
    }

    function normalizeStateText(value) {
      return value.trim().toLowerCase().replace(/[^a-z\\s]/g, " ").replace(/\\s+/g, " ").trim();
    }

    function normalizeAutocompleteText(value) {
      return value.trim().toLowerCase().replace(/[^a-z0-9\\s]/g, " ").replace(/\\s+/g, " ").trim();
    }

    function getAutocompleteConfig(question) {
      if (question.kind === "autocomplete" && question.source === "usStates") {
        return {
          items: window.__FORM_CONFIG__.autocompleteSources?.usStates ?? [],
          getValue: (item) => item.value,
          getLabel: (item) => item.label,
          getSearchTerms: (item) => item.searchTerms,
          normalize: normalizeAutocompleteText,
        };
      }
      return undefined;
    }

    function getAutocompleteDisplayValue(ctx, question, answer) {
      const autocompleteConfig = getAutocompleteConfig(question);
      if (!autocompleteConfig) return answer;
      const normalizedAnswer = normalizeAutocompleteText(answer);
      const matchedItem = autocompleteConfig.items.find((item) => normalizeAutocompleteText(autocompleteConfig.getValue(item)) === normalizedAnswer);
      return matchedItem ? autocompleteConfig.getLabel(matchedItem) : answer;
    }

    function getAutocompleteMatchScore(item, autocompleteConfig, normalizedQuery) {
      const normalize = autocompleteConfig.normalize ?? normalizeAutocompleteText;
      const normalizedValue = normalize(autocompleteConfig.getValue(item));
      const normalizedLabel = normalize(autocompleteConfig.getLabel(item));
      const normalizedTerms = autocompleteConfig.getSearchTerms(item).map((term) => normalize(term)).filter(Boolean);
      if (normalizedValue === normalizedQuery) return 0;
      if (normalizedLabel === normalizedQuery) return 1;
      if (normalizedTerms.some((term) => term === normalizedQuery)) return 2;
      if (normalizedLabel.startsWith(normalizedQuery)) return 3;
      if (normalizedValue.startsWith(normalizedQuery)) return 4;
      if (normalizedTerms.some((term) => term.startsWith(normalizedQuery))) return 5;
      if (normalizedLabel.includes(normalizedQuery) || normalizedTerms.some((term) => term.includes(normalizedQuery))) return 6;
      return Number.POSITIVE_INFINITY;
    }

    function getAutocompleteSuggestions(value, autocompleteConfig) {
      const normalizedQuery = (autocompleteConfig.normalize ?? normalizeAutocompleteText)(value);
      if (!normalizedQuery) return [];
      return autocompleteConfig.items
        .map((item) => ({ item, score: getAutocompleteMatchScore(item, autocompleteConfig, normalizedQuery) }))
        .filter((result) => Number.isFinite(result.score))
        .sort((left, right) => left.score - right.score || autocompleteConfig.getLabel(left.item).localeCompare(autocompleteConfig.getLabel(right.item)))
        .map((result) => result.item);
    }

    function updateAutocompleteSuggestionScrollHints(suggestions) {
      const shell = suggestions.closest("[data-autocomplete-suggestions-shell]");
      if (!(shell instanceof HTMLElement)) return;
      shell.dataset.canScrollUp = String(suggestions.scrollTop > 1);
      shell.dataset.canScrollDown = String(suggestions.scrollTop + suggestions.clientHeight < suggestions.scrollHeight - 1);
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
      window.requestAnimationFrame(() => updateAutocompleteSuggestionScrollHints(suggestions));
    }

    function updateAutocompleteSuggestions(input, question) {
      const step = input.closest("[data-step]");
      const shell = step ? step.querySelector("[data-autocomplete-suggestions-shell]") : undefined;
      const suggestions = step ? step.querySelector("[data-autocomplete-suggestions]") : undefined;
      const autocompleteConfig = getAutocompleteConfig(question);
      if (!(shell instanceof HTMLElement) || !(suggestions instanceof HTMLElement) || !autocompleteConfig) return;
      const suggestedItems = getAutocompleteSuggestions(input.value, autocompleteConfig);
      suggestions.replaceChildren(...suggestedItems.map((item) => {
        const button = document.createElement("button");
        button.className = "autocomplete-suggestion";
        button.type = "button";
        button.dataset.autocompleteSuggestion = autocompleteConfig.getValue(item);
        button.dataset.autocompleteLabel = autocompleteConfig.getLabel(item);
        button.innerHTML = "<span>" + autocompleteConfig.getLabel(item) + "</span><span class=\\"autocomplete-suggestion-value\\">" + autocompleteConfig.getValue(item) + "</span>";
        return button;
      }));
      updateAutocompleteSuggestionPanel(shell, suggestions, suggestedItems.length === 0);
    }

    return {
      getAnswer,
      hydrate,
      validate,
      onFocusIn(event, _ctx, question) {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.autocompleteInput === "true") {
          updateAutocompleteSuggestions(target, question);
        }
      },
      onInput(event, _ctx, question) {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.autocompleteInput === "true") {
          updateAutocompleteSuggestions(target, question);
        }
      },
      onScroll(event) {
        const target = event.target;
        if (target instanceof HTMLElement && target.matches("[data-autocomplete-suggestions]")) {
          updateAutocompleteSuggestionScrollHints(target);
        }
      },
      onClick(event, ctx) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const suggestion = target.closest("[data-autocomplete-suggestion]");
        if (!(suggestion instanceof HTMLElement)) return;
        const step = suggestion.closest("[data-step]");
        const input = step ? step.querySelector("[data-autocomplete-input]") : undefined;
        if (!(input instanceof HTMLInputElement)) return;
        input.value = suggestion.dataset.autocompleteLabel ?? suggestion.dataset.autocompleteSuggestion ?? "";
        const suggestionsShell = step?.querySelector("[data-autocomplete-suggestions-shell]");
        if (suggestionsShell instanceof HTMLElement) {
          suggestionsShell.dataset.autocompleteEmpty = "true";
          suggestionsShell.dataset.canScrollUp = "false";
          suggestionsShell.dataset.canScrollDown = "false";
          suggestionsShell.setAttribute("aria-hidden", "true");
        }
        void ctx.handleNext();
      },
    };
  })());
`;
}

function getInterstitialBehaviorScript(registerExpression: string): string {
  return `
  ${registerExpression}("interstitial", (() => {
    const matchingBenefitFadeOutMs = 300;
    const matchingBenefitFadeInMs = 420;
    const matchingBenefitDisplayMs = 950;
    const matchingBenefitMinCount = 3;
    const matchingBenefitMaxCount = 4;
    let matchingTimers = [];
    let activeMatchingRunId = 0;
    let matchingTextTransitionId = 0;
    const completedMatchingSteps = new Set();

    function clearMatchingTimers() {
      activeMatchingRunId += 1;
      matchingTextTransitionId += 1;
      matchingTimers.forEach((timer) => window.clearTimeout(timer));
      matchingTimers = [];
    }

    function scheduleMatchingTimer(callback, delay) {
      const timer = window.setTimeout(() => {
        matchingTimers = matchingTimers.filter((candidate) => candidate !== timer);
        callback();
      }, delay);
      matchingTimers.push(timer);
    }

    function isNextDisabled(ctx, question) {
      return ctx.answers[question.key] !== question.completionAnswer && ctx.answers[question.key] !== question.seenAnswer && !completedMatchingSteps.has(question.key);
    }

    function isAnswered(_ctx, question, answer) {
      return answer === question.seenAnswer;
    }

    function getAnswer(_ctx, question) {
      return question.seenAnswer;
    }

    function getCoverageStateName(ctx) {
      const fallbackAreaCode = window.__FORM_CONFIG__.customVariables?.areaCode ?? window.__FORM_CONFIG__.routeKey;
      const areaCode = String(ctx.answers.residence_state || fallbackAreaCode).toUpperCase();
      const state = (window.__FORM_CONFIG__.usStates ?? []).find((candidate) => candidate.code === areaCode);
      return state ? state.name : window.__FORM_CONFIG__.customVariables?.areaName ?? areaCode;
    }

    function formatMatchingBenefit(ctx, benefit) {
      return benefit.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_match, variableName) => {
        if (variableName === "areaName") {
          return getCoverageStateName(ctx);
        }

        return String(window.__FORM_CONFIG__.customVariables?.[variableName] ?? "");
      });
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
      if (availableBenefitCount <= 0) return 0;
      const maxBenefitCount = Math.min(matchingBenefitMaxCount, availableBenefitCount);
      const minBenefitCount = Math.min(matchingBenefitMinCount, maxBenefitCount);
      return minBenefitCount + Math.floor(Math.random() * (maxBenefitCount - minBenefitCount + 1));
    }

    function getMatchingBenefitTimeline(benefits) {
      let startsAt = 0;
      return shuffleMatchingBenefits(benefits).slice(0, getRandomMatchingBenefitCount(benefits.length)).map((text) => {
        const benefitTiming = { text, duration: matchingBenefitDisplayMs, startsAt };
        startsAt += matchingBenefitDisplayMs;
        return benefitTiming;
      });
    }

    function getMatchingElements(step) {
      return {
        status: step.querySelector("[data-matching-status]"),
        benefit: step.querySelector("[data-matching-benefit]"),
      };
    }

    function renderMatchingBenefitContent(element, content, className) {
      element.replaceChildren();
      if (className !== "is-success") {
        element.textContent = String(content);
        return;
      }
      const successLines = Array.isArray(content) ? content : String(content).split("\\n").filter((line) => line.trim()).map((line, index) => ({ text: line, color: index === 0 ? "brand-navy" : "accent" }));
      successLines.forEach((line) => {
        const lineElement = document.createElement("span");
        lineElement.className = "matching-success-line";
        lineElement.dataset.color = line.color;
        lineElement.textContent = line.text;
        element.appendChild(lineElement);
      });
    }

    function applyMatchingBenefitText(elements, text, className) {
      elements.benefit.classList.remove("is-fading-in", "is-fading-out", "is-visible", "is-success");
      renderMatchingBenefitContent(elements.benefit, text, className);
      if (className) elements.benefit.classList.add(className);
    }

    function fadeMatchingBenefitIn(elements, transitionId) {
      void elements.benefit.offsetWidth;
      elements.benefit.classList.add("is-fading-in");
      scheduleMatchingTimer(() => {
        if (transitionId !== matchingTextTransitionId) return;
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
        if (transitionId !== matchingTextTransitionId) return;
        elements.benefit.classList.remove("is-fading-out", "is-success");
        renderMatchingBenefitContent(elements.benefit, text, className);
        if (className) elements.benefit.classList.add(className);
        fadeMatchingBenefitIn(elements, transitionId);
      }, matchingBenefitFadeOutMs);
    }

    function showMatchingSuccess(question, elements, options = {}) {
      elements.status.textContent = "";
      setMatchingBenefitText(elements, question.successLines, "is-success", options);
    }

    function mount(ctx, question, step) {
      const runId = activeMatchingRunId;
      const elements = getMatchingElements(step);
      if (!elements.status || !elements.benefit) return;
      if (ctx.answers[question.key] === question.seenAnswer) {
        showMatchingSuccess(question, elements, { immediate: true });
        scheduleMatchingTimer(() => {
          if (runId === activeMatchingRunId) ctx.replaceToUrl(ctx.getRenderedNextUrl() ?? question.url);
        }, 300);
        return;
      }
      if (ctx.answers[question.key] === question.completionAnswer || completedMatchingSteps.has(question.key)) {
        showMatchingSuccess(question, elements, { immediate: true });
        return;
      }
      const benefitTimeline = getMatchingBenefitTimeline(question.benefits.map((benefit) => formatMatchingBenefit(ctx, benefit)));
      elements.status.textContent = question.loadingLabel;
      setMatchingBenefitText(elements, benefitTimeline[0]?.text ?? "", "", { initial: true });
      benefitTimeline.slice(1).forEach((benefitTiming) => {
        scheduleMatchingTimer(() => {
          if (runId === activeMatchingRunId) setMatchingBenefitText(elements, benefitTiming.text, "");
        }, benefitTiming.startsAt);
      });
      const successDelay = benefitTimeline.reduce((totalDuration, benefitTiming) => totalDuration + benefitTiming.duration, 0) || matchingBenefitDisplayMs;
      scheduleMatchingTimer(() => {
        if (runId !== activeMatchingRunId) return;
        showMatchingSuccess(question, elements);
        scheduleMatchingTimer(() => {
          void completeMatchingStep(ctx, question, runId);
        }, 900);
      }, successDelay);
    }

    async function completeMatchingStep(ctx, question, runId) {
      if (runId !== activeMatchingRunId) return;
      try {
        await ctx.saveCheckpoint(question.key, question.completionAnswer);
      } catch (checkpointError) {
        ctx.showErrorModal(checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar este paso.");
      }
      if (runId !== activeMatchingRunId) return;
      completedMatchingSteps.add(question.key);
      ctx.updateNextButton("Siguiente", false);
    }

    return {
      mount,
      unmount: clearMatchingTimers,
      isNextDisabled,
      isAnswered,
      getAnswer,
      async onNext(ctx, question) {
        if (ctx.answers[question.key] === question.seenAnswer) {
          ctx.showStep(ctx.getNextVisibleStepIndex());
          return true;
        }
        if (window.__FORM_CONFIG__.previewMode) {
          delete ctx.answers[question.key];
          completedMatchingSteps.delete(question.key);
          ctx.showStep(ctx.currentStep);
          return true;
        }
        if (ctx.answers[question.key] !== question.completionAnswer && !completedMatchingSteps.has(question.key)) {
          return true;
        }
        try {
          const nextUrl = await ctx.saveCheckpoint(question.key, question.seenAnswer);
          ctx.replaceToUrl(nextUrl ?? ctx.getRenderedNextUrl());
        } catch (checkpointError) {
          ctx.showErrorModal(checkpointError instanceof Error ? checkpointError.message : "No pudimos guardar este paso.");
        }
        return true;
      },
    };
  })());
`;
}

function getTrustedFormBehaviorScript(registerExpression: string): string {
  return `
  ${registerExpression}("trusted_form_consent", (() => {
    const trustedFormReadyPollMs = 100;
    const trustedFormReadyTimeoutMs = 5000;
    const trustedFormReadyErrorMessage = "No pudimos preparar el certificado de consentimiento. Revise su conexión e intente de nuevo.";
    let trustedFormSdkLoaded = false;
    let trustedFormSdkLoadPromise;
    let trustedFormReadyPromise;
    let trustedFormReadyFieldName;
    let trustedFormReadinessRunId = 0;
    let partytownLoadPromise;
    let partytownLoaded = false;

    function getAnswer(_ctx, question, step) {
      const checked = step.querySelector("[data-trusted-form-consent]:checked");
      return checked ? question.acceptedAnswer : "";
    }

    function hydrate(ctx, question, step, answer) {
      const input = step.querySelector("[data-trusted-form-consent]");
      if (input instanceof HTMLInputElement) {
        input.checked = answer === question.acceptedAnswer;
      }
      hydrateTrustedFormGrantorSummary(ctx, question, step);
    }

    function validate(ctx, question, step) {
      if (getAnswer(ctx, question, step) !== question.acceptedAnswer) {
        ctx.showErrorModal(question.validationMessage);
        return false;
      }
      ctx.answers[question.key] = question.acceptedAnswer;
      ctx.hideErrorModal();
      return true;
    }

    function isAnswered(_ctx, question, answer) {
      return answer === question.acceptedAnswer;
    }

    function getNextLabel(_ctx, question) {
      return question.submitLabel;
    }

    function mount(ctx, question, step) {
      syncTrustedFormElementRoles(ctx, question);
      startTrustedFormStepReadiness(ctx, question);
      hydrateTrustedFormGrantorSummary(ctx, question, step);
    }

    function unmount(ctx) {
      trustedFormReadinessRunId += 1;
      ctx.form.removeAttribute("data-tf-element-role");
      document.getElementById("next-button")?.removeAttribute("data-tf-element-role");
    }

    function syncTrustedFormElementRoles(ctx, question) {
      if (question.kind !== "trusted_form_consent") {
        ctx.form.removeAttribute("data-tf-element-role");
        return;
      }
      ctx.form.setAttribute("data-tf-element-role", "offer");
      document.getElementById("next-button")?.setAttribute("data-tf-element-role", "submit");
    }

    function hydrateTrustedFormGrantorSummary(ctx, question, step) {
      const grantorSummary = question.grantorSummary;
      if (!grantorSummary) return;
      const card = step.querySelector(".consent-card");
      if (!(card instanceof HTMLElement)) return;
      const name = (grantorSummary.nameKeys || []).map((key) => ctx.answers[key]).filter(Boolean).join(" ").trim();
      const phone = grantorSummary.phoneKey ? ctx.answers[grantorSummary.phoneKey] : "";
      const displayPhone = phone ? formatUsPhoneForDisplay(phone) : "";
      let summary = card.querySelector("[data-consent-summary]");
      if (!name && !displayPhone) {
        summary?.remove();
        return;
      }
      if (!(summary instanceof HTMLElement)) {
        summary = document.createElement("p");
        summary.className = "consent-summary";
        summary.dataset.consentSummary = "true";
        card.prepend(summary);
      }
      summary.replaceChildren();
      if (name) {
        const nameElement = document.createElement("span");
        nameElement.dataset.tfElementRole = "consent-grantor-name";
        nameElement.textContent = name;
        summary.appendChild(nameElement);
      }
      if (name && displayPhone) summary.appendChild(document.createTextNode(" · "));
      if (displayPhone) {
        const phoneElement = document.createElement("span");
        phoneElement.dataset.tfElementRole = "consent-grantor-phone";
        phoneElement.textContent = displayPhone;
        summary.appendChild(phoneElement);
      }
    }

    function startTrustedFormStepReadiness(ctx, question) {
      const runId = (trustedFormReadinessRunId += 1);
      if (getTrustedFormCertUrl(question.trustedForm)) {
        ctx.updateNextButton(question.submitLabel, ctx.isSubmitting);
        return;
      }
      ctx.updateNextButton("Preparando...", true);
      ensureTrustedFormReady(question.trustedForm).then(() => {
        if (runId !== trustedFormReadinessRunId || ctx.getQuestion().kind !== "trusted_form_consent") return;
        ctx.updateNextButton(question.submitLabel, ctx.isSubmitting);
      }).catch((trustedFormError) => {
        if (runId !== trustedFormReadinessRunId || ctx.getQuestion().kind !== "trusted_form_consent") return;
        ctx.updateNextButton(question.submitLabel, ctx.isSubmitting);
        if (!question.trustedForm.allowSubmitWithoutCert) {
          ctx.showErrorModal(getTrustedFormReadyErrorMessage(trustedFormError));
        }
      });
    }

    function ensureTrustedFormReady(trustedForm) {
      const certUrl = getTrustedFormCertUrl(trustedForm);
      if (certUrl) return Promise.resolve(certUrl);
      const fieldName = trustedForm?.fieldName ?? "";
      if (trustedFormReadyPromise && trustedFormReadyFieldName === fieldName) return trustedFormReadyPromise;
      trustedFormReadyFieldName = fieldName;
      trustedFormReadyPromise = loadTrustedFormSdk(trustedForm).then(() => waitForTrustedFormCertUrl(trustedForm)).catch((trustedFormError) => {
        trustedFormReadyPromise = undefined;
        trustedFormReadyFieldName = undefined;
        throw trustedFormError;
      });
      return trustedFormReadyPromise;
    }

    function loadTrustedFormSdk(trustedForm) {
      const globalState = getTrustedFormGlobalState();
      if (trustedFormSdkLoaded || globalState.sdkLoaded || window.trustedForm?.lock) return Promise.resolve();
      if (trustedFormSdkLoadPromise) return trustedFormSdkLoadPromise;
      if (globalState.sdkLoadPromise) {
        trustedFormSdkLoadPromise = globalState.sdkLoadPromise;
        return trustedFormSdkLoadPromise;
      }
      if (!trustedForm || trustedFormSdkLoaded) return Promise.resolve();
      const sdkUrl = buildTrustedFormSdkUrl(trustedForm);
      if (!sdkUrl) return Promise.reject(new Error(trustedFormReadyErrorMessage));
      if (hasTrustedFormSdkScript(sdkUrl)) {
        trustedFormSdkLoaded = true;
        globalState.sdkLoaded = true;
        return Promise.resolve();
      }
      if (trustedForm.delivery === "partytown") {
        trustedFormSdkLoadPromise = loadTrustedFormSdkWithPartytown(trustedForm, sdkUrl).catch((trustedFormError) => {
          trustedFormSdkLoadPromise = undefined;
          globalState.sdkLoadPromise = undefined;
          throw trustedFormError;
        });
        globalState.sdkLoadPromise = trustedFormSdkLoadPromise;
        return trustedFormSdkLoadPromise;
      }
      const script = document.createElement("script");
      script.async = true;
      script.src = sdkUrl;
      script.dataset.trustedFormSdk = "true";
      trustedFormSdkLoadPromise = new Promise((resolve, reject) => {
        script.addEventListener("load", () => {
          trustedFormSdkLoaded = true;
          globalState.sdkLoaded = true;
          resolve();
        }, { once: true });
        script.addEventListener("error", () => {
          trustedFormSdkLoadPromise = undefined;
          globalState.sdkLoadPromise = undefined;
          script.remove();
          reject(new Error(trustedFormReadyErrorMessage));
        }, { once: true });
      });
      globalState.sdkLoadPromise = trustedFormSdkLoadPromise;
      document.body.appendChild(script);
      return trustedFormSdkLoadPromise;
    }

    async function loadTrustedFormSdkWithPartytown(trustedForm, sdkUrl) {
      await ensurePartytownReady(trustedForm);
      if (hasTrustedFormSdkScript(sdkUrl)) {
        trustedFormSdkLoaded = true;
        getTrustedFormGlobalState().sdkLoaded = true;
        return;
      }
      const script = document.createElement("script");
      script.type = "text/partytown";
      script.src = sdkUrl;
      script.dataset.trustedFormSdk = "true";
      document.body.appendChild(script);
      trustedFormSdkLoaded = true;
      getTrustedFormGlobalState().sdkLoaded = true;
      window.dispatchEvent(new CustomEvent("ptupdate"));
    }

    function getTrustedFormGlobalState() {
      window.__INSTANT_TRUSTED_FORM_CERTIFY__ = window.__INSTANT_TRUSTED_FORM_CERTIFY__ || {};
      return window.__INSTANT_TRUSTED_FORM_CERTIFY__;
    }

    function hasTrustedFormSdkScript(sdkUrl) {
      return Array.from(document.querySelectorAll('script[data-trusted-form-sdk="true"]')).some((script) => script.src === sdkUrl);
    }

    function ensurePartytownReady(trustedForm) {
      if (partytownLoaded) return Promise.resolve();
      if (partytownLoadPromise) return partytownLoadPromise;
      window.partytown = {
        ...(window.partytown || {}),
        lib: trustedForm.partytownLib || "/~partytown/",
      };
      const existingRuntime = document.querySelector('script[data-partytown-runtime="true"]');
      if (existingRuntime) {
        partytownLoaded = true;
        return Promise.resolve();
      }
      const runtime = document.createElement("script");
      runtime.src = trustedForm.partytownScriptUrl || "/~partytown/partytown.js";
      runtime.async = false;
      runtime.dataset.partytownRuntime = "true";
      partytownLoadPromise = new Promise((resolve, reject) => {
        runtime.addEventListener("load", () => {
          partytownLoaded = true;
          resolve();
        }, { once: true });
        runtime.addEventListener("error", () => {
          partytownLoadPromise = undefined;
          runtime.remove();
          reject(new Error(trustedFormReadyErrorMessage));
        }, { once: true });
      });
      document.head.appendChild(runtime);
      return partytownLoadPromise;
    }

    function buildTrustedFormSdkUrl(trustedForm) {
      if (!trustedForm.scriptBaseUrl) return undefined;
      const url = new URL(trustedForm.scriptBaseUrl, window.location.href);
      const usesProxyAliases = shouldUseTrustedFormProxyAliases(trustedForm, url);
      const fieldParam = usesProxyAliases ? "f" : "field";
      const taggedConsentParam = usesProxyAliases ? "t" : "use_tagged_consent";
      const sandboxParam = usesProxyAliases ? "s" : "sandbox";
      if (trustedForm.fieldName && !url.searchParams.has(fieldParam)) url.searchParams.set(fieldParam, trustedForm.fieldName);
      if (trustedForm.useTaggedConsent && !url.searchParams.has(taggedConsentParam)) url.searchParams.set(taggedConsentParam, "true");
      if (trustedForm.sandbox && !url.searchParams.has(sandboxParam)) url.searchParams.set(sandboxParam, "true");
      return url.toString();
    }

    function shouldUseTrustedFormProxyAliases(trustedForm, url) {
      if (!trustedForm.scriptProxyKey) return false;
      return (
        url.origin === window.location.origin &&
        url.pathname.startsWith("/_instant/scripts/") &&
        url.pathname.endsWith("/" + trustedForm.scriptProxyKey + ".js")
      );
    }

    function waitForTrustedFormCertUrl(trustedForm) {
      const startedAt = Date.now();
      return new Promise((resolve, reject) => {
        const checkForCertUrl = () => {
          const certUrl = getTrustedFormCertUrl(trustedForm);
          if (certUrl) {
            resolve(certUrl);
            return;
          }
          if (Date.now() - startedAt >= trustedFormReadyTimeoutMs) {
            reject(new Error(trustedFormReadyErrorMessage));
            return;
          }
          window.setTimeout(checkForCertUrl, trustedFormReadyPollMs);
        };
        checkForCertUrl();
      });
    }

    function getTrustedFormReadyErrorMessage(error) {
      return error instanceof Error && error.message ? error.message : trustedFormReadyErrorMessage;
    }

    function getTrustedFormCertUrl(trustedForm = window.__FORM_CONFIG__.currentStep.trustedForm) {
      const fieldName = trustedForm?.fieldName;
      if (!fieldName) return undefined;
      const field = document.querySelector('input[name="' + CSS.escape(fieldName) + '"]');
      if (!(field instanceof HTMLInputElement)) return undefined;
      const value = field.value.trim();
      return value || undefined;
    }

    function formatUsPhoneForDisplay(value) {
      const digitsOnly = value.replace(/\\D/g, "");
      const nationalDigits = digitsOnly.startsWith("1") && digitsOnly.length > 10 ? digitsOnly.slice(1, 11) : digitsOnly.slice(0, 10);
      if (nationalDigits.length === 0) return "";
      if (nationalDigits.length <= 3) return "(" + nationalDigits;
      if (nationalDigits.length <= 6) return "(" + nationalDigits.slice(0, 3) + ") " + nationalDigits.slice(3);
      return "(" + nationalDigits.slice(0, 3) + ") " + nationalDigits.slice(3, 6) + "-" + nationalDigits.slice(6, 10);
    }

    return {
      beforeSubmit: async (_ctx, question) => {
        let trustedFormCertUrl = getTrustedFormCertUrl(question.trustedForm);
        try {
          trustedFormCertUrl = await ensureTrustedFormReady(question.trustedForm);
        } catch (trustedFormError) {
          if (!question.trustedForm.allowSubmitWithoutCert) {
            throw new Error(getTrustedFormReadyErrorMessage(trustedFormError));
          }
          trustedFormCertUrl = getTrustedFormCertUrl(question.trustedForm);
        }
        return { trustedFormCertUrl };
      },
      getAnswer,
      getNextLabel,
      hydrate,
      isAnswered,
      mount,
      unmount,
      validate,
    };
  })());
`;
}
