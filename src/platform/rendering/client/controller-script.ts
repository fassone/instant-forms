import type { FormStep } from "../../flow";
import { getPartytownBootstrapSource } from "../../scripts/partytown-bootstrap";

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
  const nextButtonLoadingReasons = new Set();
  let nextButtonLoadingSize;
  let isActionPointerDown = false;
  let errorModalReturnFocusTarget;
  let transitionAssetLoaded = false;
  let transitionAssetPromise;
  let checkpointQueue = Promise.resolve();
  let checkpointQueueError;
  let checkpointQueueFailedQuestionKey;
  const resolvedStepCache = new Map();
  const resolvedStepRequests = new Map();
  const trustedFormPreloadedResources = new Set();
  const initialTrackingEventKeys = new Set((Array.isArray(config.initialTrackingEvents) ? config.initialTrackingEvents : []).map(getTrackingEventKey));
  let lastTrackedStepViewKey = "";

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
    const currentResolvedStepPayload =
      currentQuestion && requiresResolvedStepPayload(currentQuestion) && steps[currentStep]
        ? { key: currentQuestion.key, url: currentQuestion.url, html: steps[currentStep].outerHTML, config: currentQuestion }
        : undefined;
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
    if (currentResolvedStepPayload) {
      cacheResolvedStepPayload(currentResolvedStepPayload);
    }

    const pathStepIndex = getStepIndexForPath(currentPath);
    const keyStepIndex = config.steps.findIndex((question) => question.key === currentQuestion?.key);
    currentStep = pathStepIndex !== -1 ? pathStepIndex : keyStepIndex !== -1 ? keyStepIndex : 0;
    mountedStepIndex = -1;
    showStep(currentStep);
    restoreStepDraft(currentQuestion, currentDraftAnswer);
    preloadResolvedDynamicSteps();
    preloadTrustedFormAssets();
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
      nextButton,
      backButton,
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
      setFormChrome,
      setNextButtonLoading,
      getQuestion,
      getStepElement,
      getRenderedNextUrl,
      getNextVisibleStepIndex,
      getPathname,
      getMetaBrowserTrackingData,
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
      isServerTrackedEvent,
      trackServerFormEvent,
      trackFormEvent,
      updateNextButton,
    };
  }

  function bootstrapInstantFormRuntime() {
    nextButton.addEventListener("click", (event) => {
      const activeBehavior = getActiveBehavior();
      if (activeBehavior?.usesNativeSubmit?.(getContext(), getQuestion(), getStepElement())) {
        return;
      }

      event.preventDefault();
      void handleNext();
    });

    backButton.addEventListener("click", () => {
      const activeBehavior = getActiveBehavior();
      if (activeBehavior?.beforeBack?.(getContext(), getQuestion(), getStepElement())) {
        return;
      }

      const previousUrl = getRenderedPreviousUrl();
      if (previousUrl) {
        navigateToUrl(previousUrl);
      }
    });

    form.addEventListener("submit", (event) => {
      const submitResult = getActiveBehavior()?.onSubmit?.(event, getContext(), getQuestion(), getStepElement());
      if (submitResult === "allowDefault") {
        return;
      }
      if (submitResult) {
        return;
      }

      event.preventDefault();
      void handleNext({ source: "submit" });
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
        if (getActiveBehavior()?.usesNativeSubmit?.(getContext(), getQuestion(), getStepElement())) {
          return;
        }

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

    captureMetaBrowserIds();
    pushInitialClientTrackingEvents();
    showStep(config.activeStepIndex);
    preloadTransitionAsset();
    preloadTrustedFormAssets();
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
    setFormChrome(getStepFormChrome(question));
    if (stepCount) {
      stepCount.textContent = formatStepCountLabel(countedStepNumber, countedStepCount);
      stepCount.setAttribute("aria-hidden", String(!question.countsAsStep));
    }

    progressBar.style.width = (countedStepNumber / countedStepCount) * 100 + "%";
    hideErrorModal();
    hydrateCurrentStepAnswer(question);
    updateNextButton();
    mountCurrentBehavior();
    requestCurrentResolvedStepPayloadIfNeeded();
    preloadTrustedFormAssets();
    trackStepView(question, currentStep);
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
    const isLoading = isNextButtonLoading();
    const label = labelOverride ?? behavior?.getNextLabel?.(getContext(), question, getStepElement()) ?? (isCurrentStepFinal() ? config.ui.actions.submit : config.ui.actions.next);
    const accessibleLoadingLabel = config.ui.actions.loading;
    if (isLoading) {
      freezeNextButtonSize();
      renderNextButtonContent(accessibleLoadingLabel, true);
      nextButton.setAttribute("aria-label", accessibleLoadingLabel);
    } else {
      releaseNextButtonSize();
      renderNextButtonContent(label, false);
      nextButton.removeAttribute("aria-label");
    }
    nextButton.disabled = isLoading;
    nextButton.dataset.loading = String(isLoading);
    applyNextButtonState(label, behavior, question);
    if (isLoading) {
      nextButton.setAttribute("aria-busy", "true");
    } else {
      nextButton.removeAttribute("aria-busy");
    }
    backButton.disabled = !getRenderedPreviousUrl() || isLoading;
  }

  function applyNextButtonState(label, behavior, question) {
    const buttonState = behavior?.getNextButtonState?.(getContext(), question, getStepElement()) ?? {};
    nextButton.type = buttonState.type ?? "button";
    nextButton.name = buttonState.name ?? "next";
    nextButton.value = buttonState.value ?? label;
    if (buttonState.tfRole) {
      nextButton.setAttribute("data-tf-element-role", buttonState.tfRole);
    } else {
      nextButton.removeAttribute("data-tf-element-role");
    }
  }

  function renderNextButtonContent(label, isLoading) {
    nextButton.replaceChildren();

    if (isLoading) {
      const spinner = document.createElement("span");
      spinner.className = "button-spinner";
      spinner.setAttribute("aria-hidden", "true");
      nextButton.appendChild(spinner);
    }

    if (isLoading) {
      return;
    }

    const labelElement = document.createElement("span");
    labelElement.className = "button-label";
    labelElement.textContent = label;
    nextButton.appendChild(labelElement);
  }

  function freezeNextButtonSize() {
    if (nextButtonLoadingSize) {
      return;
    }

    const rect = nextButton.getBoundingClientRect();
    nextButtonLoadingSize = {
      minWidth: nextButton.style.minWidth,
      minHeight: nextButton.style.minHeight,
    };
    nextButton.style.minWidth = Math.ceil(rect.width) + "px";
    nextButton.style.minHeight = Math.ceil(rect.height) + "px";
  }

  function releaseNextButtonSize() {
    if (!nextButtonLoadingSize) {
      return;
    }

    nextButton.style.minWidth = nextButtonLoadingSize.minWidth;
    nextButton.style.minHeight = nextButtonLoadingSize.minHeight;
    nextButtonLoadingSize = undefined;
  }

  function isNextButtonLoading() {
    return isSubmitting || nextButtonLoadingReasons.size > 0;
  }

  function setNextButtonLoading(reason, isLoading) {
    if (isLoading) {
      nextButtonLoadingReasons.add(reason);
    } else {
      nextButtonLoadingReasons.delete(reason);
    }
    updateNextButton();
  }

  function setFormChrome(chrome) {
    form.dataset.formChrome = normalizeFormChrome(chrome);
  }

  function formatStepCountLabel(current, total) {
    return String(config.ui.progress.stepCount).replaceAll("{{current}}", String(current)).replaceAll("{{total}}", String(total));
  }

  function getStepFormChrome(question) {
    return normalizeFormChrome(question?.presentation?.chrome);
  }

  function getTrustedFormSubstepChrome(question, substep) {
    if (question?.kind !== "trusted_form_consent") {
      return getStepFormChrome(question);
    }

    return normalizeFormChrome(question.substeps?.[substep]?.presentation?.chrome ?? question.presentation?.chrome);
  }

  function normalizeFormChrome(chrome) {
    return chrome === "hidden" || chrome === "hidden_on_mobile" ? chrome : "visible";
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

  function preloadTrustedFormAssets() {
    if (config.previewMode) {
      return;
    }

    getTrustedFormPreloadAssets().forEach((asset) => {
      if (!shouldPreloadTrustedFormAsset(asset)) {
        return;
      }

      asset.resources.forEach((resource) => {
        preloadTrustedFormResource(resource.url, resource.as);
      });
    });
  }

  function getTrustedFormPreloadAssets() {
    const configuredAssets = Array.isArray(config.trustedFormPreloadAssets) ? config.trustedFormPreloadAssets : [];
    if (!hasFullStepContext()) {
      return configuredAssets;
    }

    const derivedAssets = config.steps
      .filter((question) => question.kind === "trusted_form_consent" && question.trustedForm?.preloadAssets !== "never")
      .map((question) => {
        return {
          stepKey: question.key,
          stepUrl: question.url,
          preloadAssets: question.trustedForm.preloadAssets,
          resources: getTrustedFormPreloadResources(question.trustedForm),
        };
      })
      .filter((asset) => asset.resources.length > 0);

    return [...configuredAssets, ...derivedAssets];
  }

  function shouldPreloadTrustedFormAsset(asset) {
    if (!asset || asset.preloadAssets === "never" || !Array.isArray(asset.resources)) {
      return false;
    }

    if (asset.preloadAssets === "previous_step") {
      return getPathname(getRenderedNextUrl() || "") === getPathname(asset.stepUrl);
    }

    const stepIndex = getStepIndexForPath(getPathname(asset.stepUrl));
    if (stepIndex === -1) {
      return asset.preloadAssets === "when_reachable";
    }

    return isQuestionVisible(config.steps[stepIndex]) && stepIndex >= currentStep;
  }

  function getTrustedFormPreloadResources(trustedForm) {
    const sdkUrl = buildTrustedFormSdkPreloadUrl(trustedForm);
    if (!sdkUrl) {
      return [];
    }

    return [{ url: sdkUrl, as: "script" }];
  }

  function buildTrustedFormSdkPreloadUrl(trustedForm) {
    if (!trustedForm?.scriptBaseUrl) {
      return undefined;
    }

    const url = getSameOriginUrl(trustedForm.scriptBaseUrl);
    if (!url) {
      return undefined;
    }

    const usesProxyAliases = shouldUseTrustedFormPreloadProxyAliases(trustedForm, url);
    const fieldParam = usesProxyAliases ? "f" : "field";
    const taggedConsentParam = usesProxyAliases ? "t" : "use_tagged_consent";
    const sandboxParam = usesProxyAliases ? "s" : "sandbox";

    if (trustedForm.fieldName && !url.searchParams.has(fieldParam)) {
      url.searchParams.set(fieldParam, trustedForm.fieldName);
    }
    if (trustedForm.useTaggedConsent && !url.searchParams.has(taggedConsentParam)) {
      url.searchParams.set(taggedConsentParam, "true");
    }
    if (trustedForm.sandbox && !url.searchParams.has(sandboxParam)) {
      url.searchParams.set(sandboxParam, "true");
    }

    return url.pathname + url.search;
  }

  function shouldUseTrustedFormPreloadProxyAliases(trustedForm, url) {
    return Boolean(
      trustedForm.scriptProxyKey &&
      url.origin === window.location.origin &&
      url.pathname.endsWith("/" + trustedForm.scriptProxyKey + ".js")
    );
  }

  function preloadTrustedFormResource(url, resourceType) {
    if (!url) {
      return;
    }

    const sameOriginPath = getSameOriginPath(url);
    if (!sameOriginPath || trustedFormPreloadedResources.has(sameOriginPath)) {
      return;
    }

    trustedFormPreloadedResources.add(sameOriginPath);
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = resourceType || "script";
    link.href = sameOriginPath;
    link.dataset.trustedFormPreload = "true";
    document.head.appendChild(link);
  }

  function getSameOriginPath(value) {
    const url = getSameOriginUrl(value);
    return url ? url.pathname + url.search : undefined;
  }

  function getSameOriginUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin ? url : undefined;
    } catch {
      return undefined;
    }
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

    applyCachedResolvedStepPayload(config.steps[stepIndex]);
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
    return Boolean(question) && isQuestionVisible(question) && (!requiresResolvedStepPayload(question) || hasCachedResolvedStepPayload(question));
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
      showErrorModal(config.ui.errors.requiredAnswer, { returnFocusTarget: getValidationErrorReturnFocusTarget(options.focusInvalid !== false) });
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

    trackFormEvent("validationError", {
      error_message: String(message || ""),
      ...getStepTrackingPayload(getQuestion(), currentStep),
    });
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

  async function writeCheckpointNow(questionKey, answer, options = {}) {
    if (config.previewMode) {
      answers[questionKey] = answer;
      return config.steps[currentStep]?.url;
    }

    const tracking = getMetaBrowserTrackingData();
    if (typeof options.stepUrl === "string") {
      tracking.eventSourceUrl = new URL(options.stepUrl, window.location.origin).toString();
    }
    const response = await fetch("/api/forms/" + encodeURIComponent(config.routeKey) + "/checkpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionKey, answer, tracking }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const firstError = Array.isArray(body.errors) ? body.errors[0] : undefined;
      throw new Error(firstError && firstError.message ? firstError.message : config.ui.errors.checkpointSaveFailed);
    }

    if (body.answers && typeof body.answers === "object") {
      Object.assign(answers, body.answers);
    }
    if (body.nextStep && typeof body.nextStep === "object") {
      cacheResolvedStepPayload(body.nextStep);
    }
    pushTrackingEvents(body.trackingEvents);
    preloadResolvedDynamicSteps();

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

    const checkpointTask = checkpointQueue.then(() => writeCheckpointNow(questionKey, answer, options));
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

  function requiresResolvedStepPayload(question) {
    return Array.isArray(question?.dynamicResolverDependencies) && question.dynamicResolverDependencies.length > 0;
  }

  function canRequestResolvedStepPayload(question) {
    if (!requiresResolvedStepPayload(question)) {
      return false;
    }

    const optionalDependencies = new Set(question.optionalDynamicResolverDependencies || []);
    return (
      canAccessQuestion(question) &&
      question.dynamicResolverDependencies.every((dependency) => optionalDependencies.has(dependency) || Boolean(answers[dependency]))
    );
  }

  function canAccessQuestion(question) {
    const stepIndex = config.steps.indexOf(question);
    if (stepIndex === -1 || !isQuestionVisible(question)) {
      return false;
    }

    const visibleStepIndexes = getVisibleStepIndexes();
    const requestedVisibleIndex = visibleStepIndexes.indexOf(stepIndex);
    if (requestedVisibleIndex === -1) {
      return false;
    }

    const firstUnansweredStepIndex = visibleStepIndexes.find((visibleStepIndex) => {
      const candidate = config.steps[visibleStepIndex];
      return candidate && !isStepAnswered(candidate);
    });

    if (typeof firstUnansweredStepIndex !== "number") {
      return true;
    }

    const firstUnansweredVisibleIndex = visibleStepIndexes.indexOf(firstUnansweredStepIndex);
    return firstUnansweredVisibleIndex !== -1 && requestedVisibleIndex <= firstUnansweredVisibleIndex;
  }

  function getResolvedStepCacheKey(question) {
    return JSON.stringify({
      url: question.url,
      dependencies: (question.dynamicResolverDependencies || []).map((dependency) => [dependency, answers[dependency] ?? ""]),
    });
  }

  function hasCachedResolvedStepPayload(question) {
    return resolvedStepCache.has(getResolvedStepCacheKey(question));
  }

  function getCachedResolvedStepPayload(question) {
    return resolvedStepCache.get(getResolvedStepCacheKey(question));
  }

  function cacheResolvedStepPayload(stepPayload) {
    if (!stepPayload || typeof stepPayload !== "object" || !stepPayload.config) {
      return;
    }

    const question = stepPayload.config;
    resolvedStepCache.set(getResolvedStepCacheKey(question), stepPayload);
    applyResolvedStepPayload(stepPayload);
  }

  function applyCachedResolvedStepPayload(question) {
    const stepPayload = getCachedResolvedStepPayload(question);
    if (stepPayload) {
      applyResolvedStepPayload(stepPayload);
    }
  }

  function applyResolvedStepPayload(stepPayload) {
    const stepIndex = config.steps.findIndex((question) => question.url === stepPayload.url || question.key === stepPayload.key);
    if (stepIndex === -1) {
      return;
    }

    config.steps[stepIndex] = stepPayload.config;
    const existingStep = steps[stepIndex];
    if (existingStep && stepPayload.html) {
      const activeTrustedFormSubstep = getActiveTrustedFormSubstep(existingStep);
      existingStep.outerHTML = stepPayload.html;
      steps = Array.from(document.querySelectorAll("[data-step]"));
      steps[stepIndex]?.setAttribute("aria-hidden", String(stepIndex !== currentStep));
      if (stepIndex === currentStep) {
        if (activeTrustedFormSubstep === "consent" && config.steps[stepIndex]?.kind === "trusted_form_consent") {
          setTrustedFormSubstepDom(steps[stepIndex], activeTrustedFormSubstep);
          setFormChrome(getTrustedFormSubstepChrome(config.steps[stepIndex], activeTrustedFormSubstep));
          hydrateCurrentStepAnswer(config.steps[stepIndex]);
          updateNextButton();
          return;
        }
        mountedStepIndex = -1;
        showStep(stepIndex);
      }
    }
  }

  function getActiveTrustedFormSubstep(step) {
    const consentPanel = step.querySelector('[data-trusted-form-substep="consent"]');
    if (consentPanel instanceof HTMLElement && consentPanel.getAttribute("aria-hidden") === "false") {
      return "consent";
    }

    return undefined;
  }

  function setTrustedFormSubstepDom(step, activeSubstep) {
    const panels = step?.querySelector("[data-trusted-form-substeps]");
    if (panels instanceof HTMLElement) {
      panels.dataset.trustedFormActiveSubstep = activeSubstep;
    }

    Array.from(step?.querySelectorAll("[data-trusted-form-substep]") ?? []).forEach((panel) => {
      if (panel instanceof HTMLElement) {
        panel.setAttribute("aria-hidden", String(panel.dataset.trustedFormSubstep !== activeSubstep));
      }
    });
  }

  function preloadResolvedDynamicSteps() {
    if (!transitionAssetLoaded || config.previewMode) {
      return;
    }

    config.steps.forEach((question) => {
      if (canRequestResolvedStepPayload(question) && !hasCachedResolvedStepPayload(question)) {
        void requestResolvedStepPayload(question).catch(() => undefined);
      }
    });
  }

  function requestCurrentResolvedStepPayloadIfNeeded() {
    const question = getQuestion();
    if (!canRequestResolvedStepPayload(question) || hasCachedResolvedStepPayload(question)) {
      return;
    }

    void requestResolvedStepPayload(question).catch(() => undefined);
  }

  async function requestResolvedStepPayload(question) {
    const cacheKey = getResolvedStepCacheKey(question);
    const cachedStepPayload = resolvedStepCache.get(cacheKey);
    if (cachedStepPayload) {
      return cachedStepPayload;
    }

    if (resolvedStepRequests.has(cacheKey)) {
      return resolvedStepRequests.get(cacheKey);
    }

    const request = fetch("/api/forms/" + encodeURIComponent(config.routeKey) + "/resolutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepKey: question.key, answers }),
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const firstError = Array.isArray(body.errors) ? body.errors[0] : undefined;
        throw new Error(firstError && firstError.message ? firstError.message : config.ui.errors.stepResolutionFailed);
      }
      if (!body.step) {
        throw new Error(config.ui.errors.stepResolutionFailed);
      }
      cacheResolvedStepPayload(body.step);
      return body.step;
    }).finally(() => {
      resolvedStepRequests.delete(cacheKey);
    });

    resolvedStepRequests.set(cacheKey, request);
    return request;
  }

  function reconcileCheckpointFailure(error, options = {}) {
    if (options.reconcile === false) {
      return;
    }

    const message = error instanceof Error ? error.message : config.ui.errors.checkpointSaveFailed;
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
      trackFormEvent("submitAttempt", getStepTrackingPayload(getQuestion(), currentStep));
      const response = await fetch("/api/forms/" + encodeURIComponent(config.routeKey) + "/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, ...submitMetadata, tracking: getMetaBrowserTrackingData() }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const firstError = Array.isArray(body.errors) ? body.errors[0] : undefined;
        throw new Error(firstError && firstError.message ? firstError.message : config.ui.errors.submissionFailed);
      }

      form.hidden = true;
      thanks.hidden = false;
      thanks.focus();
      const responseBody = await response.json().catch(() => ({}));
      pushTrackingEvents(responseBody.trackingEvents);
    } catch (submitError) {
      submitErrorMessage = submitError instanceof Error ? submitError.message : config.ui.errors.submissionFailed;
    } finally {
      isSubmitting = false;
      updateNextButton();
    }

    if (submitErrorMessage) {
      trackFormEvent("submitError", {
        error_message: submitErrorMessage,
        ...getStepTrackingPayload(getQuestion(), currentStep),
      });
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
    if (!isServerTrackedEvent("stepAnswer", question)) {
      trackFormEvent("stepAnswer", {
        ...getStepTrackingPayload(question, currentStep),
        answer_key: question.key,
      });
    }
    preloadResolvedDynamicSteps();
    const stepUrl = question.url;
    const mode = options.mode ?? "push";
    const isFinal = isCurrentStepFinal();

    if (isFinal) {
      setSubmitting(true);
      try {
        await queueCheckpoint(question.key, answer, { stepUrl, reconcile: false });
        await submitForm();
      } catch (checkpointError) {
        setSubmitting(false);
        reconcileCheckpointFailure(checkpointError, { stepUrl });
      }
      return;
    }

    const assetReady = await waitForTransitionAssetBudget();
    const predictedUrl = getRenderedNextUrl() ?? config.steps[getNextVisibleStepIndex()]?.url;

    if (!predictedUrl) {
      return;
    }

    const predictedStepIndex = getStepIndexForPath(getPathname(predictedUrl));
    const predictedStep = config.steps[predictedStepIndex];
    const resolvedStepReady =
      assetReady &&
      predictedStep &&
      (!requiresResolvedStepPayload(predictedStep) || hasCachedResolvedStepPayload(predictedStep));

    if (assetReady && resolvedStepReady && navigateWithTransitionAsset(predictedUrl, mode)) {
      void queueCheckpoint(question.key, answer, { stepUrl, predictedUrl, mode }).catch(() => undefined);
      return;
    }

    setNextButtonLoading("navigation", true);
    try {
      const nextUrl = await queueCheckpoint(question.key, answer, { stepUrl, predictedUrl, mode, reconcile: false });
      navigateToUrl(nextUrl ?? predictedUrl);
    } catch (checkpointError) {
      showErrorModal(checkpointError instanceof Error ? checkpointError.message : config.ui.errors.checkpointSaveFailed);
    } finally {
      setNextButtonLoading("navigation", false);
    }
  }

  function setSubmitting(nextSubmitting) {
    isSubmitting = nextSubmitting;
    updateNextButton();
  }

  function trackStepView(question, stepIndex) {
    const trackingKey = question ? question.url + "|" + question.key : "";
    if (!question || trackingKey === lastTrackedStepViewKey) {
      return;
    }

    lastTrackedStepViewKey = trackingKey;
    trackFormEvent("stepView", getStepTrackingPayload(question, stepIndex));
  }

  function trackFormEvent(eventKind, payload = {}) {
    const googleTagManager = config.tracking?.googleTagManager;
    if (!googleTagManager || !window.dataLayer || typeof window.dataLayer.push !== "function") {
      return;
    }
    const eventConfig = getTrackingEventConfig(eventKind, getQuestion());
    if (!eventConfig) {
      return;
    }

    window.dataLayer.push({
      event: eventConfig.name,
      route_key: googleTagManager.routeKey,
      form_name: googleTagManager.formName,
      page_name: googleTagManager.pageName,
      ...getTrackingContextPayload(eventConfig),
      ...getTrackingPayloadForEvent(eventConfig, payload),
    });
  }

  function pushTrackingEvents(events) {
    const googleTagManager = config.tracking?.googleTagManager;
    if (!googleTagManager || !window.dataLayer || typeof window.dataLayer.push !== "function" || !Array.isArray(events)) {
      return;
    }

    events.forEach((eventPayload) => {
      if (eventPayload && typeof eventPayload === "object" && typeof eventPayload.event === "string") {
        window.dataLayer.push(eventPayload);
      }
    });
  }

  function pushInitialClientTrackingEvents() {
    pushTrackingEvents(config.initialTrackingEvents);
  }

  async function trackServerFormEvent(eventKind, payload = {}) {
    const question = getQuestion();
    if (!isServerTrackedEvent(eventKind, question)) {
      trackFormEvent(eventKind, payload);
      return;
    }
    const trackingEventKey = getTrackingEventKey({
      event: getTrackingEventConfig(eventKind, question)?.name,
      step_key: question?.key,
      trusted_form_substep: payload.trusted_form_substep,
    });
    if (initialTrackingEventKeys.delete(trackingEventKey)) {
      return;
    }

    const response = await fetch("/api/forms/" + encodeURIComponent(config.routeKey) + "/tracking-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventKind,
        stepKey: question?.key,
        trustedFormSubstep: payload.trusted_form_substep,
        answers,
        tracking: getMetaBrowserTrackingData(),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return;
    }
    pushTrackingEvents(body.trackingEvents);
  }

  function getTrackingEventConfig(eventKind, question) {
    const googleTagManager = config.tracking?.googleTagManager;
    const globalEvent = googleTagManager?.events?.[eventKind];
    const stepOverride = question?.tracking?.[eventKind];
    if (stepOverride === false) {
      return undefined;
    }

    if (stepOverride && typeof stepOverride === "object") {
      return { ...(globalEvent || {}), includeStep: false, ...stepOverride };
    }

    return globalEvent;
  }

  function isServerTrackedEvent(eventKind, question) {
    const eventConfig = getTrackingEventConfig(eventKind, question);
    return Boolean(eventConfig?.meta);
  }

  function getTrackingEventKey(eventPayload) {
    if (!eventPayload || typeof eventPayload !== "object") {
      return "";
    }
    return [
      eventPayload.event || "",
      eventPayload.step_key || "",
      eventPayload.trusted_form_substep || "",
    ].join("|");
  }

  function getTrackingContextPayload(eventConfig) {
    const googleTagManager = config.tracking?.googleTagManager;
    const context = googleTagManager?.context || {};
    const includeContext = Array.isArray(eventConfig.includeContext) ? eventConfig.includeContext : [];
    const includedContext = Object.fromEntries(includeContext.flatMap((key) => {
      const value = context[key];
      return value === undefined ? [] : [[key, value]];
    }));

    return Object.keys(includedContext).length > 0 ? { context: includedContext } : {};
  }

  function getTrackingPayloadForEvent(eventConfig, payload) {
    if (eventConfig.includeStep) {
      return payload;
    }

    const nextPayload = { ...payload };
    delete nextPayload.step_key;
    delete nextPayload.step_slug;
    delete nextPayload.step_index;
    delete nextPayload.step_kind;
    delete nextPayload.step_url;
    return nextPayload;
  }

  function getStepTrackingPayload(question, stepIndex) {
    if (!question) {
      return {};
    }

    return {
      step_key: question.key,
      step_slug: question.slug,
      step_index: stepIndex,
      step_kind: question.kind,
      step_url: question.url,
    };
  }

  function captureMetaBrowserIds() {
    if (!hasMetaTrackingEvents()) {
      return;
    }

    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid) {
      setBrowserCookie("_fbc", "fb.1." + Date.now() + "." + fbclid);
    }

    if (!readBrowserCookie("_fbp")) {
      setBrowserCookie("_fbp", "fb.1." + Date.now() + "." + Math.random().toString(36).slice(2));
    }
  }

  function hasMetaTrackingEvents() {
    const events = config.tracking?.googleTagManager?.events || {};
    return Object.values(events).some((eventConfig) => Boolean(eventConfig?.meta));
  }

  function getMetaBrowserTrackingData() {
    const urlFbclid = new URLSearchParams(window.location.search).get("fbclid") || undefined;
    return {
      fbp: readBrowserCookie("_fbp") || undefined,
      fbc: readBrowserCookie("_fbc") || undefined,
      fbclid: urlFbclid,
      eventSourceUrl: window.location.href,
    };
  }

  function readBrowserCookie(name) {
    const prefix = name + "=";
    const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
  }

  function setBrowserCookie(name, value) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = name + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=7776000; SameSite=Lax" + secure;
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
        ctx.showErrorModal(ctx.config.ui.errors.requiredAnswer);
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
        ctx.showErrorModal(ctx.config.ui.errors.requiredAnswer, { returnFocusTarget });
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
      const answer = getAnswer(ctx, question, step);
      const normalizedPhone = normalizeUsPhoneNumber(answer);
      if (!normalizedPhone) {
        const returnFocusTarget = options.focusInvalid !== false ? step.querySelector(".text-input") : undefined;
        ctx.showErrorModal(answer ? ctx.config.ui.errors.invalidPhone : ctx.config.ui.errors.requiredAnswer, { returnFocusTarget });
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
        ctx.showErrorModal(question.validationMessage || ctx.config.ui.errors.invalidAutocomplete, { returnFocusTarget });
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

    function getMatchingLoadingReason(question) {
      return "interstitial:" + question.key;
    }

    function clearMatchingTimers(ctx, question) {
      activeMatchingRunId += 1;
      matchingTextTransitionId += 1;
      matchingTimers.forEach((timer) => window.clearTimeout(timer));
      matchingTimers = [];
      if (ctx && question) {
        ctx.setNextButtonLoading(getMatchingLoadingReason(question), false);
      }
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
        ctx.setNextButtonLoading(getMatchingLoadingReason(question), false);
        showMatchingSuccess(question, elements, { immediate: true });
        scheduleMatchingTimer(() => {
          if (runId === activeMatchingRunId) ctx.replaceToUrl(ctx.getRenderedNextUrl() ?? question.url);
        }, 300);
        return;
      }
      if (ctx.answers[question.key] === question.completionAnswer || completedMatchingSteps.has(question.key)) {
        ctx.setNextButtonLoading(getMatchingLoadingReason(question), false);
        showMatchingSuccess(question, elements, { immediate: true });
        return;
      }
      ctx.setNextButtonLoading(getMatchingLoadingReason(question), true);
      const benefitTimeline = getMatchingBenefitTimeline(question.benefits);
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
        ctx.showErrorModal(checkpointError instanceof Error ? checkpointError.message : ctx.config.ui.errors.checkpointStepSaveFailed);
      }
      if (runId !== activeMatchingRunId) return;
      completedMatchingSteps.add(question.key);
      ctx.setNextButtonLoading(getMatchingLoadingReason(question), false);
      ctx.updateNextButton(ctx.config.ui.actions.next, false);
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
        ctx.setNextButtonLoading(getMatchingLoadingReason(question), true);
        try {
          const nextUrl = await ctx.saveCheckpoint(question.key, question.seenAnswer);
          ctx.replaceToUrl(nextUrl ?? ctx.getRenderedNextUrl());
        } catch (checkpointError) {
          ctx.setNextButtonLoading(getMatchingLoadingReason(question), false);
          ctx.showErrorModal(checkpointError instanceof Error ? checkpointError.message : ctx.config.ui.errors.checkpointStepSaveFailed);
        }
        return true;
      },
    };
  })());
`;
}

function getTrustedFormBehaviorScript(registerExpression: string): string {
  const partytownBootstrapSource = JSON.stringify(getPartytownBootstrapSource()).replace(/<\/script/giu, "<\\/script");
  return `
  ${registerExpression}("trusted_form_consent", (() => {
    const partytownBootstrapSource = ${partytownBootstrapSource};
    const trustedFormReadyPollMs = 100;
    const trustedFormReadyTimeoutMs = 5000;
    const trustedFormReadyErrorMessage = window.__FORM_CONFIG__.ui.errors.trustedFormCertFailed;
    const trustedFormReviewLoadingReason = "trusted-form-review";
    const trustedFormSubmitLoadingReason = "trusted-form-submit";
    let trustedFormSdkLoaded = false;
    let trustedFormSdkLoadPromise;
    let trustedFormReadyPromise;
    let trustedFormReadyFieldName;
    let partytownLoadPromise;
    let partytownLoaded = false;
    let activeSubstep = "review";
    let allowNativeSubmit = false;

    function getAnswer(_ctx, question, step) {
      const checked = step.querySelector("[data-trusted-form-consent]:checked");
      return checked ? question.acceptedAnswer : "";
    }

    function hydrate(ctx, question, step, answer) {
      const input = step.querySelector("[data-trusted-form-consent]");
      if (input instanceof HTMLInputElement) {
        input.checked = answer === question.acceptedAnswer;
      }
      hydrateTrustedFormFieldBank(question, step);
    }

    function validate(ctx, question, step) {
      if (getAnswer(ctx, question, step) !== question.acceptedAnswer) {
        ctx.showErrorModal(question.consent.validationMessage);
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
      return activeSubstep === "review"
        ? question.review.nextLabel || window.__FORM_CONFIG__.ui.actions.next
        : question.consent.submitLabel || window.__FORM_CONFIG__.ui.actions.submit;
    }

    function mount(ctx, question, step) {
      activeSubstep = "review";
      allowNativeSubmit = false;
      installTrustedFormRequestProxyShim();
      configureNativeTrustedForm(ctx, question);
      setTrustedFormSubstep(ctx, question, step, "review");
      startTrustedFormStepReadiness(ctx, question);
      hydrateTrustedFormFieldBank(question, step);
    }

    function unmount(ctx) {
      ctx.form.removeAttribute("data-tf-element-role");
      ctx.form.noValidate = true;
      ctx.nextButton.removeAttribute("data-tf-element-role");
      ctx.nextButton.name = "next";
      ctx.nextButton.type = "button";
      ctx.setNextButtonLoading(trustedFormReviewLoadingReason, false);
      ctx.setNextButtonLoading(trustedFormSubmitLoadingReason, false);
    }

    function configureNativeTrustedForm(ctx, _question) {
      ctx.form.setAttribute("data-tf-element-role", "offer");
      ctx.form.method = "post";
      ctx.form.action = "/api/forms/" + encodeURIComponent(ctx.config.routeKey) + "/native-submissions";
      ctx.form.enctype = "application/x-www-form-urlencoded";
      ctx.form.noValidate = false;
    }

    function setTrustedFormSubstep(ctx, question, step, nextSubstep) {
      activeSubstep = nextSubstep;
      ctx.setFormChrome(getTrustedFormSubstepChrome(question, activeSubstep));
      const panels = step.querySelector("[data-trusted-form-substeps]");
      if (panels instanceof HTMLElement) {
        panels.dataset.trustedFormActiveSubstep = activeSubstep;
      }
      Array.from(step.querySelectorAll("[data-trusted-form-substep]")).forEach((panel) => {
        if (panel instanceof HTMLElement) {
          panel.setAttribute("aria-hidden", String(panel.dataset.trustedFormSubstep !== activeSubstep));
        }
      });
      updateTrustedFormDisplayCopy(step, question);
      ctx.updateNextButton();
      const trackingPayload = {
        step_key: question.key,
        step_slug: question.slug,
        step_index: ctx.currentStep,
        step_kind: question.kind,
        step_url: question.url,
        trusted_form_substep: activeSubstep,
      };
      if (ctx.isServerTrackedEvent("trustedFormSubstepView", question)) {
        void ctx.trackServerFormEvent("trustedFormSubstepView", trackingPayload);
      } else {
        ctx.trackFormEvent("trustedFormSubstepView", trackingPayload);
      }
      if (activeSubstep === "review") {
        scheduleTrustedFormReviewScrollHints(step);
      } else {
        scheduleTrustedFormConsentScrollHints(step);
      }
    }

    function getTrustedFormSubstepChrome(question, substep) {
      return question.substeps?.[substep]?.presentation?.chrome ?? question.presentation?.chrome ?? "visible";
    }

    function updateTrustedFormDisplayCopy(step, question) {
      const title = step.querySelector("[data-question-title]");
      const description = step.querySelector("[data-question-description]");
      const copy = activeSubstep === "review" ? question.review : question.consent;
      if (title instanceof HTMLElement) {
        title.textContent = copy.title || "";
      }
      if (description instanceof HTMLElement) {
        const descriptionHtml = copy.description?.html || "";
        description.innerHTML = descriptionHtml;
        description.hidden = !descriptionHtml;
      }
    }

    function hydrateTrustedFormFieldBank(question, step) {
      const fields = Array.isArray(question.review?.fields) ? question.review.fields : [];
      fields.forEach((field) => {
        const input = step.querySelector('input[name="' + CSS.escape(field.name) + '"]');
        if (input instanceof HTMLInputElement) {
          input.value = String(field.value || "");
          delete input.dataset.tfElementRole;
        }
      });
      scheduleTrustedFormReviewScrollHints(step);
    }

    function scheduleTrustedFormReviewScrollHints(step) {
      const reviewScroll = step.querySelector("[data-trusted-form-review-scroll]");
      if (!(reviewScroll instanceof HTMLElement)) return;
      window.requestAnimationFrame(() => updateTrustedFormReviewScrollHints(reviewScroll));
    }

    function updateTrustedFormReviewScrollHints(reviewScroll) {
      const shell = reviewScroll.closest("[data-trusted-form-review-scroll-shell]");
      if (!(shell instanceof HTMLElement)) return;
      const canScroll = reviewScroll.scrollHeight > reviewScroll.clientHeight + 1;
      shell.dataset.canScrollUp = String(canScroll && reviewScroll.scrollTop > 1);
      shell.dataset.canScrollDown = String(
        canScroll && reviewScroll.scrollTop + reviewScroll.clientHeight < reviewScroll.scrollHeight - 1,
      );
    }

    function scheduleTrustedFormConsentScrollHints(step) {
      const consentScroll = step.querySelector("[data-trusted-form-consent-scroll]");
      if (!(consentScroll instanceof HTMLElement)) return;
      window.requestAnimationFrame(() => updateTrustedFormConsentScrollHints(consentScroll));
    }

    function updateTrustedFormConsentScrollHints(consentScroll) {
      const shell = consentScroll.closest("[data-trusted-form-consent-scroll-shell]");
      if (!(shell instanceof HTMLElement)) return;
      const canScroll = consentScroll.scrollHeight > consentScroll.clientHeight + 1;
      shell.dataset.canScrollUp = String(canScroll && consentScroll.scrollTop > 1);
      shell.dataset.canScrollDown = String(
        canScroll && consentScroll.scrollTop + consentScroll.clientHeight < consentScroll.scrollHeight - 1,
      );
    }

    function startTrustedFormStepReadiness(ctx, question) {
      if (getTrustedFormCertUrl(question.trustedForm)) return;
      ensureTrustedFormReady(question.trustedForm).catch(() => undefined);
    }

    async function continueFromReview(ctx, question, step) {
      ctx.setNextButtonLoading(trustedFormReviewLoadingReason, true);
      try {
        await ensureTrustedFormReady(question.trustedForm);
        setTrustedFormSubstep(ctx, question, step, "consent");
      } catch (trustedFormError) {
        if (question.trustedForm.allowSubmitWithoutCert) {
          setTrustedFormSubstep(ctx, question, step, "consent");
        } else {
          ctx.showErrorModal(getTrustedFormReadyErrorMessage(trustedFormError));
        }
      } finally {
        ctx.setNextButtonLoading(trustedFormReviewLoadingReason, false);
      }
    }

    async function submitNativeWhenReady(event, ctx, question, step) {
      if (!validate(ctx, question, step)) {
        return;
      }

      ctx.trackFormEvent("submitAttempt", {
        step_key: question.key,
        step_slug: question.slug,
        step_index: ctx.currentStep,
        step_kind: question.kind,
        step_url: question.url,
        trusted_form_substep: activeSubstep,
      });
      ctx.setNextButtonLoading(trustedFormSubmitLoadingReason, true);
      try {
        await ctx.queueCheckpoint(question.key, question.acceptedAnswer, { stepUrl: question.url, reconcile: false });
      } catch {
        // Native submission can still use the posted answer fields. Checkpoint persistence is best-effort here.
      }

      let trustedFormCertUrl = getTrustedFormCertUrl(question.trustedForm);
      try {
        trustedFormCertUrl = await ensureTrustedFormReady(question.trustedForm);
      } catch (trustedFormError) {
        if (!question.trustedForm.allowSubmitWithoutCert) {
          ctx.setNextButtonLoading(trustedFormSubmitLoadingReason, false);
          ctx.trackFormEvent("submitError", {
            step_key: question.key,
            step_slug: question.slug,
            step_index: ctx.currentStep,
            step_kind: question.kind,
            step_url: question.url,
            trusted_form_substep: activeSubstep,
            error_message: getTrustedFormReadyErrorMessage(trustedFormError),
          });
          ctx.showErrorModal(getTrustedFormReadyErrorMessage(trustedFormError));
          return;
        }
        trustedFormCertUrl = getTrustedFormCertUrl(question.trustedForm);
      }

      syncNativeSubmissionFields(ctx, question, step, trustedFormCertUrl);
      ctx.setNextButtonLoading(trustedFormSubmitLoadingReason, false);
      allowNativeSubmit = true;
      ctx.form.requestSubmit(ctx.nextButton);
    }

    function syncNativeSubmissionFields(ctx, question, step, trustedFormCertUrl) {
      const container = getNativeSubmissionFieldContainer(ctx.form);
      container.replaceChildren();
      const postedAnswers = { ...ctx.answers, [question.key]: question.acceptedAnswer };
      Object.keys(postedAnswers).forEach((answerKey) => {
        appendHiddenInput(container, "answers[" + answerKey + "]", postedAnswers[answerKey]);
      });
      if (trustedFormCertUrl) {
        appendHiddenInput(container, "trustedFormCertUrl", trustedFormCertUrl);
        appendHiddenInput(container, question.trustedForm.fieldName, trustedFormCertUrl);
      }
      const trackingFields = ctx.getMetaBrowserTrackingData ? ctx.getMetaBrowserTrackingData() : getMetaBrowserTrackingData();
      Object.keys(trackingFields).forEach((trackingKey) => {
        const trackingValue = trackingFields[trackingKey];
        if (trackingValue) {
          appendHiddenInput(container, "tracking[" + trackingKey + "]", trackingValue);
        }
      });

      const certField = step.querySelector('input[name="' + CSS.escape(question.trustedForm.fieldName) + '"]');
      if (certField instanceof HTMLInputElement && trustedFormCertUrl) {
        certField.value = trustedFormCertUrl;
      }
    }

    function getNativeSubmissionFieldContainer(form) {
      let container = form.querySelector("[data-native-submission-fields]");
      if (!(container instanceof HTMLElement)) {
        container = document.createElement("div");
        container.dataset.nativeSubmissionFields = "true";
        container.hidden = true;
        form.appendChild(container);
      }
      return container;
    }

    function appendHiddenInput(container, name, value) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value ?? "";
      container.appendChild(input);
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
      runtime.dataset.partytownRuntime = "true";
      partytownLoadPromise = new Promise((resolve, reject) => {
        try {
          runtime.text = partytownBootstrapSource;
          document.head.appendChild(runtime);
          partytownLoaded = true;
          resolve();
        } catch {
          partytownLoadPromise = undefined;
          runtime.remove();
          reject(new Error(trustedFormReadyErrorMessage));
        }
      });
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

    function installTrustedFormRequestProxyShim() {
      if (window.__INSTANT_TRUSTED_FORM_PROXY_SHIM__) return;
      window.__INSTANT_TRUSTED_FORM_PROXY_SHIM__ = true;
      const nativeFetch = window.fetch;
      window.fetch = function(input, init) {
        if (typeof input === "string" || input instanceof URL) {
          return nativeFetch.call(this, rewriteTrustedFormUrl(input), init);
        }
        if (input instanceof Request && shouldProxyTrustedFormUrl(input.url)) {
          return nativeFetch.call(this, new Request(rewriteTrustedFormUrl(input.url), input), init);
        }
        return nativeFetch.call(this, input, init);
      };

      const nativeOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        return nativeOpen.call(this, method, rewriteTrustedFormUrl(url), ...rest);
      };

      if (navigator.sendBeacon) {
        const nativeSendBeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function(url, data) {
          return nativeSendBeacon(rewriteTrustedFormUrl(url), data);
        };
      }

      patchElementSetAttribute();
      patchSrcProperty(HTMLImageElement.prototype);
      patchSrcProperty(HTMLScriptElement.prototype);
      patchSrcProperty(HTMLIFrameElement.prototype);
      patchHtmlStringWriter(document, "write");
      patchHtmlStringWriter(document, "writeln");
      patchInsertAdjacentHTML();
    }

    function rewriteTrustedFormUrl(value) {
      if (!shouldProxyTrustedFormUrl(value)) return value;
      const url = new URL(String(value), window.location.href);
      return "/_instant/trustedform/proxy?u=" + encodeURIComponent(url.toString());
    }

    function shouldProxyTrustedFormUrl(value) {
      try {
        const url = new URL(String(value), window.location.href);
        return url.protocol === "https:" && (url.hostname === "trustedform.com" || url.hostname.endsWith(".trustedform.com"));
      } catch {
        return false;
      }
    }

    function patchElementSetAttribute() {
      const nativeSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name, value) {
        if (String(name).toLowerCase() === "src") {
          return nativeSetAttribute.call(this, name, rewriteTrustedFormUrl(value));
        }
        return nativeSetAttribute.call(this, name, value);
      };
    }

    function patchSrcProperty(prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "src");
      if (!descriptor || !descriptor.set) return;
      Object.defineProperty(prototype, "src", {
        ...descriptor,
        set(value) {
          descriptor.set.call(this, rewriteTrustedFormUrl(value));
        },
      });
    }

    function patchHtmlStringWriter(target, methodName) {
      const nativeMethod = target[methodName];
      if (typeof nativeMethod !== "function") return;
      target[methodName] = function(...parts) {
        return nativeMethod.apply(this, parts.map(rewriteTrustedFormHtml));
      };
    }

    function patchInsertAdjacentHTML() {
      const nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
      Element.prototype.insertAdjacentHTML = function(position, text) {
        return nativeInsertAdjacentHTML.call(this, position, rewriteTrustedFormHtml(text));
      };
    }

    function rewriteTrustedFormHtml(value) {
      return String(value).replace(/https:\\/\\/[^"'<>\\s)]+trustedform\\.com[^"'<>\\s)]*/g, (url) => rewriteTrustedFormUrl(url));
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
      getNextButtonState(ctx, question) {
        if (activeSubstep === "consent") {
          return {
            type: "submit",
            name: "trusted_form_submit",
            value: question.consent.submitLabel || ctx.config.ui.actions.submit,
            tfRole: "submit",
          };
        }

        return {
          type: "button",
          name: "next",
          value: question.review.nextLabel || ctx.config.ui.actions.next,
        };
      },
      hydrate,
      isAnswered,
      mount,
      async onNext(ctx, question, step) {
        if (activeSubstep === "review") {
          await continueFromReview(ctx, question, step);
          return true;
        }
        ctx.form.requestSubmit(ctx.nextButton);
        return true;
      },
      onSubmit(event, ctx, question, step) {
        if (activeSubstep !== "consent") {
          event.preventDefault();
          void continueFromReview(ctx, question, step);
          return true;
        }

        if (allowNativeSubmit) {
          allowNativeSubmit = false;
          syncNativeSubmissionFields(ctx, question, step, getTrustedFormCertUrl(question.trustedForm));
          return "allowDefault";
        }

        event.preventDefault();
        void submitNativeWhenReady(event, ctx, question, step);
        return true;
      },
      beforeBack(ctx, question, step) {
        if (activeSubstep === "consent") {
          setTrustedFormSubstep(ctx, question, step, "review");
          return true;
        }
        return false;
      },
      onScroll(event) {
        const target = event.target;
        if (target instanceof HTMLElement && target.matches("[data-trusted-form-review-scroll]")) {
          updateTrustedFormReviewScrollHints(target);
        }
        if (target instanceof HTMLElement && target.matches("[data-trusted-form-consent-scroll]")) {
          updateTrustedFormConsentScrollHints(target);
        }
      },
      unmount,
      usesNativeSubmit() {
        return activeSubstep === "consent";
      },
      validate,
    };
  })());
`;
}
