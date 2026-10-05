import { US_STATES } from "../../shared/data/us-states";
import { renderQuoteEntryPage, type QuoteEntryPage } from "../rendering/quote-entry-page";
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";

import {
  applyTrackingVisitorIdCookie,
  createAttributionCookieCollector,
  type AttributionCookieCollector,
  clearPostSubmitState,
  readCheckpointAnswers,
  setCheckpointAnswers,
  readPostSubmitState,
} from "../app/http/cookies";
import { htmlResponse, redirectNoStore } from "../app/http/responses";
import {
  canAccessStep,
  sanitizeCheckpointAnswers,
  validateCheckpointAnswer,
  getNextStepIndex,
  getResumeStepIndex,
} from "../persistence/checkpoints";
import {
  getStepIndexByLegacySlug,
  getStepIndexBySlug,
  getStepSlug,
  type FormStep,
  type InstantForm,
} from "../flow";
import {
  readPrebuiltFormPage,
  readPrebuiltUnavailablePage,
  renderPostSubmitPage,
  renderFormPage,
  renderUnavailablePage,
  type UnavailablePageContent,
  createLifecycleTrackingEvent,
  type LifecycleTrackingEvent,
} from "../rendering";
import { scheduleTrackingServerCallback } from "../app/tracking/server-effects";
import { getRequestId, logInstantFormEvent, type InstantFormLogger, type InstantFormLogLevel } from "../logging";

const RESERVED_PREVIEW_FOLDER = "__preview";
const FORM_ROUTE_FOLDER_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const NOT_FOUND_KEY = "notFound";

export type RedirectRouteAction = {
  type: "redirect";
  to: string;
};

export type UnavailableRouteAction = UnavailablePageContent & {
  type: "unavailable";
  status: number;
};

export type QuoteEntryRouteAction = { type: "quote_entry"; content: QuoteEntryPage; selection: boolean };
export type GenericStateFallbackAction = { type: "generic_state"; to: string; unavailable: UnavailableRouteAction };
export type FormRouteAction = RedirectRouteAction | UnavailableRouteAction | QuoteEntryRouteAction | GenericStateFallbackAction;

export type FormRouteNodeInput = InstantForm | FormRouteGroupInput | FormRouteAction;

export type FormRouteGroupInput = {
  index?: InstantForm | FormRouteAction;
  queryPrefill?: Record<string, string>;
  notFound?: FormRouteAction;
} & {
  [segment: string]: FormRouteNodeInput | Record<string, string> | undefined;
};

export type FormRouteFlowNode = {
  type: "flow";
  form: InstantForm;
};

export type FormRouteGroupNode = {
  index?: FormRouteFlowNode | { type: "action"; action: FormRouteAction };
  queryPrefill?: Record<string, string>;
  type: "group";
  children: Readonly<Record<string, FormRouteNode>>;
  notFound?: FormRouteAction;
};

export type FormRouteNode = FormRouteFlowNode | FormRouteGroupNode | { type: "action"; action: FormRouteAction };

export type FormRoutesInput = {
  index: FormRouteAction;
  folders: Record<string, FormRouteNodeInput>;
  notFound: UnavailableRouteAction;
};

export type FormRoutes = {
  index: FormRouteAction;
  folders: Readonly<Record<string, FormRouteNode>>;
  notFound: UnavailableRouteAction;
};

export type FormRouteBuildEntry = {
  routeKey: string;
  routeSegments: readonly string[];
  form: InstantForm;
};

export function redirectTo(to: string): RedirectRouteAction {
  return { type: "redirect", to };
}

export function unavailable(input: UnavailablePageContent & { status?: number }): UnavailableRouteAction {
  return {
    type: "unavailable",
    locale: input.locale,
    title: input.title,
    message: input.message,
    cta: input.cta,
    status: input.status ?? 404,
  };
}

export function defineFormRoutes(input: FormRoutesInput): FormRoutes {
  return {
    index: input.index,
    folders: normalizeRouteNodes(input.folders),
    notFound: input.notFound,
  };
}

export function registerFormRoutePages(app: Hono, routes: FormRoutes, eventLogger?: InstantFormLogger): void {
  registerRouteAction(app, "/", routes.index, routes);

  for (const [folder, node] of Object.entries(routes.folders)) {
    registerPublicRouteNode(app, [folder], node, routes.notFound, routes, eventLogger);
    registerPreviewRouteNode(app, [folder], node, routes.notFound);
  }
}

export function getFormRouteBuildEntries(routes: FormRoutes): FormRouteBuildEntry[] {
  return Object.entries(routes.folders).flatMap(([folder, node]) => getFormRouteNodeBuildEntries([folder], node));
}

export function getFormRouteByRouteKey(routes: FormRoutes, routeKey: string): FormRouteBuildEntry | undefined {
  const normalizedRouteKey = routeKey.trim().toLowerCase();

  return getFormRouteBuildEntries(routes).find((entry) => entry.routeKey === normalizedRouteKey);
}

export function getFormRouteKey(routeSegments: readonly string[]): string {
  return routeSegments.join("_");
}

export function getFormRouteStepUrl(routeSegments: readonly string[], stepDefinition: FormStep): string {
  return getPublicStepUrl(routeSegments, stepDefinition);
}

export function getFormRoutePostSubmitUrl(routeSegments: readonly string[], form: InstantForm): string {
  return `${getFolderRoot(routeSegments)}/${form.postSubmit.slug}`;
}

export function getFormRouteStepUrlOverrides(
  routeSegments: readonly string[],
  form: InstantForm,
): Record<string, string> {
  return createStepUrlOverrides(routeSegments, form);
}

export function renderFormRouteNotFound(c: Context, routes: FormRoutes): Promise<Response> {
  return executeRouteAction(c, routes.notFound, undefined, true);
}

function getFormRouteNodeBuildEntries(routeSegments: readonly string[], node: FormRouteNode): FormRouteBuildEntry[] {
  if (node.type === "flow") {
    return [{ routeKey: getFormRouteKey(routeSegments), routeSegments, form: node.form }];
  }

  if (node.type === "action") return [];
  return [
    ...(node.index?.type === "flow" ? [{ routeKey: getFormRouteKey(routeSegments), routeSegments, form: node.index.form }] : []),
    ...Object.entries(node.children).flatMap(([childSegment, childNode]) =>
      getFormRouteNodeBuildEntries([...routeSegments, childSegment], childNode)),
  ];
}

function logRouteEvent(
  c: Context,
  logger: InstantFormLogger | undefined,
  input: {
    level: InstantFormLogLevel;
    event: string;
    routeKey?: string;
    form?: InstantForm;
    stepKey?: string;
    status?: number;
    data?: unknown;
  },
): void {
  logInstantFormEvent(logger, {
    level: input.level,
    event: input.event,
    requestId: getRequestId(c.req.raw),
    routeKey: input.routeKey,
    formName: input.form?.name,
    pageName: input.form?.page.name,
    stepKey: input.stepKey,
    status: input.status,
    data: input.data,
  });
}

function registerPublicRouteNode(
  app: Hono,
  routeSegments: readonly string[],
  node: FormRouteNode,
  inheritedFallback: FormRouteAction,
  routes: FormRoutes,
  eventLogger?: InstantFormLogger,
): void {
  if (node.type === "flow") {
    registerPublicFormFolder(app, routeSegments, node.form, eventLogger);
    return;
  }

  const folderRoot = getFolderRoot(routeSegments);
  if (node.type === "action") {
    registerRouteAction(app, folderRoot, node.action, routes);
    return;
  }
  const fallback = node.notFound ?? inheritedFallback;

  for (const [childSegment, childNode] of Object.entries(node.children)) {
    registerPublicRouteNode(app, [...routeSegments, childSegment], childNode, fallback, routes, eventLogger);
  }

  if (node.index?.type === "flow") {
    registerPublicFormFolder(app, routeSegments, node.index.form, eventLogger, { fallback, queryPrefill: node.queryPrefill });
  } else {
    registerRouteAction(app, folderRoot, node.index?.action ?? fallback, routes);
    app.get(`${folderRoot}/*`, (c) => executeRouteAction(c, fallback));
  }
}

function registerPublicFormFolder(
  app: Hono,
  routeSegments: readonly string[],
  form: InstantForm,
  eventLogger?: InstantFormLogger,
  options: { fallback?: FormRouteAction; queryPrefill?: Record<string, string> } = {},
): void {
  const folderRoot = getFolderRoot(routeSegments);
  const routeKey = getFormRouteKey(routeSegments);

  app.get(folderRoot, (c) => {
    const attribution = captureFlowAttribution(c, form);
    const answers = readCheckpointAnswers(c, form, routeKey);
    const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));
    const target = getPublicStepUrl(routeSegments, resumeStep);

    logRouteEvent(c, eventLogger, {
      level: "info",
      event: "form.redirect",
      routeKey,
      form,
      status: 302,
      data: { from: folderRoot, to: target, reason: "resume_step" },
    });

    return redirectToFlowUrl(c, form, target, attribution);
  });

  app.get(getFormRoutePostSubmitUrl(routeSegments, form), async (c) => {
    const attribution = captureFlowAttribution(c, form);
    const postSubmitState = readPostSubmitState(c, routeKey);

    if (!postSubmitState) {
      logRouteEvent(c, eventLogger, {
        level: "info",
        event: "post_submit.redirect",
        routeKey,
        form,
        status: 302,
        data: { from: getFormRoutePostSubmitUrl(routeSegments, form), to: folderRoot, reason: "missing_state" },
      });
      return redirectToFlowUrl(c, form, folderRoot, attribution);
    }

    clearPostSubmitState(c, routeKey);
    c.header("Cache-Control", "no-store");
    logRouteEvent(c, eventLogger, {
      level: "info",
      event: "post_submit.rendered",
      routeKey,
      form,
      status: 200,
      data: { trackingEventCount: postSubmitState.trackingEvents.length },
    });

    return attribution.applyTo(
      c.html(
        await renderPostSubmitPage(form, routeKey, {
          trackingEvents: postSubmitState.trackingEvents,
          stepCountLabel: postSubmitState.stepCountLabel,
        }),
        200,
      ),
    );
  });

  app.get(`${folderRoot}/:stepSlug`, async (c) => {
    const attribution = captureFlowAttribution(c, form);
    const stepSlug = c.req.param("stepSlug");
    const stepIndex = getStepIndexBySlug(form, stepSlug);

    if (stepIndex === -1 && options.fallback) return executeRouteAction(c, options.fallback);
    if (stepIndex === -1) {
      const legacyStepIndex = getStepIndexByLegacySlug(form, stepSlug);

      if (legacyStepIndex !== -1) {
        const answers = readCheckpointAnswers(c, form, routeKey);

        if (!canAccessStep(form, legacyStepIndex, answers)) {
          const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

          return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, resumeStep), attribution);
        }

        const legacyStep = getStepAt(form, legacyStepIndex);
        logRouteEvent(c, eventLogger, {
          level: "info",
          event: "form.redirect",
          routeKey,
          form,
          stepKey: legacyStep.key,
          status: 302,
          data: {
            from: c.req.path,
            to: getPublicStepUrl(routeSegments, legacyStep),
            reason: "legacy_step_slug",
          },
        });

        return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, legacyStep), attribution);
      }

      logRouteEvent(c, eventLogger, {
        level: "info",
        event: "form.redirect",
        routeKey,
        form,
        status: 302,
        data: { from: c.req.path, to: folderRoot, reason: "unknown_step_slug" },
      });
      return redirectToFlowUrl(c, form, folderRoot, attribution);
    }

    const answers = readCheckpointAnswers(c, form, routeKey);
    const requestedStep = getStepAt(form, stepIndex);

    if (!canAccessStep(form, stepIndex, answers)) {
      const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));
      logRouteEvent(c, eventLogger, {
        level: "info",
        event: "form.redirect",
        routeKey,
        form,
        stepKey: requestedStep.key,
        status: 302,
        data: {
          from: c.req.path,
          to: getPublicStepUrl(routeSegments, resumeStep),
          reason: "guarded_step",
        },
      });

      return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, resumeStep), attribution);
    }

    if (requestedStep.kind === "interstitial" && answers[requestedStep.key] === requestedStep.seenAnswer) {
      const nextStep = getStepAt(form, getNextStepIndex(form, stepIndex, answers));
      logRouteEvent(c, eventLogger, {
        level: "info",
        event: "form.redirect",
        routeKey,
        form,
        stepKey: requestedStep.key,
        status: 302,
        data: {
          from: c.req.path,
          to: getPublicStepUrl(routeSegments, nextStep),
          reason: "seen_interstitial",
        },
      });

      return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, nextStep), attribution);
    }

    const initialTrackingEvents = createInitialRouteTrackingEvents(
      c,
      form,
      routeKey,
      requestedStep,
      stepIndex,
      answers,
      eventLogger,
    );

    const initialPrefill: Record<string, string> = {};
    const prefillQuery: Record<string, string> = {};
    for (const [queryParam, answerKey] of Object.entries(options.queryPrefill ?? {})) {
      const step = form.steps.find((candidate) => candidate.key === answerKey);
      if (!step) continue;
      const validation = validateCheckpointAnswer(form, step, c.req.query(queryParam));
      if (validation.ok) {
        initialPrefill[answerKey] = validation.answer;
        prefillQuery[queryParam] = validation.answer;
      }
    }
    const renderOptions = {
      ...(options.queryPrefill ? { initialPrefill, prefillQuery } : {}),
      activeStepIndex: stepIndex,
      answers,
      routeKey,
      stepUrlOverrides: createStepUrlOverrides(routeSegments, form),
      initialTrackingEvents: initialTrackingEvents.map((event) => event.payload),
    };
    const prebuiltHtml = await readPrebuiltFormPage(form, {
      ...renderOptions,
      routeSegments,
    });
    logRouteEvent(c, eventLogger, {
      level: "info",
      event: "form.rendered",
      routeKey,
      form,
      stepKey: requestedStep.key,
      status: 200,
      data: { stepIndex, prebuilt: Boolean(prebuiltHtml), trackingEventCount: initialTrackingEvents.length },
    });

    return attribution.applyTo(
      applyTrackingVisitorIdCookie(
        c,
        htmlResponse(
          prebuiltHtml ??
            (await renderFormPage(form, {
              ...renderOptions,
            })),
          200,
          "no-store",
        ),
      ),
    );
  });

  app.get(`${folderRoot}/*`, (c) => {
    if (options.fallback) return executeRouteAction(c, options.fallback);
    const attribution = captureFlowAttribution(c, form);

    return redirectToFlowUrl(c, form, folderRoot, attribution);
  });
}

function registerPreviewRouteNode(
  app: Hono,
  routeSegments: readonly string[],
  node: FormRouteNode,
  inheritedFallback: FormRouteAction,
): void {
  if (node.type === "flow") {
    registerPreviewFormFolder(app, routeSegments, node.form);
    return;
  }

  const previewFolderRoot = getFolderRoot([RESERVED_PREVIEW_FOLDER, ...routeSegments]);
  if (node.type === "action") {
    app.get(previewFolderRoot, (c) => executeRouteAction(c, node.action));
    return;
  }
  const fallback = node.notFound ?? inheritedFallback;

  const indexAction = node.index?.type === "action" ? node.index.action : fallback;
  if (node.index?.type !== "flow") app.get(previewFolderRoot, (c) => executeRouteAction(c, indexAction, RESERVED_PREVIEW_FOLDER));

  for (const [childSegment, childNode] of Object.entries(node.children)) {
    registerPreviewRouteNode(app, [...routeSegments, childSegment], childNode, fallback);
  }

  if (node.index?.type === "flow") registerPreviewFormFolder(app, routeSegments, node.index.form);
  app.get(`${previewFolderRoot}/*`, (c) => executeRouteAction(c, fallback, RESERVED_PREVIEW_FOLDER));
}

function registerPreviewFormFolder(app: Hono, routeSegments: readonly string[], form: InstantForm): void {
  const previewFolderRoot = getFolderRoot([RESERVED_PREVIEW_FOLDER, ...routeSegments]);
  const routeKey = getFormRouteKey(routeSegments);

  app.get(previewFolderRoot, (c) => {
    const firstStep = getStepAt(form, 0);

    return redirectNoStore(c, getPreviewStepUrl(routeSegments, firstStep));
  });

  app.get(`${previewFolderRoot}/:stepSlug`, async (c) => {
    const stepSlug = c.req.param("stepSlug");
    const stepIndex = getStepIndexBySlug(form, stepSlug);

    if (stepIndex === -1) {
      return renderUnavailableResponse(getPreviewUnavailableAction(routeSegments));
    }

    const requestedStep = getStepAt(form, stepIndex);
    const previewForm = {
      ...form,
      steps: [requestedStep],
    };
    const previewUrl = getPreviewStepUrl(routeSegments, requestedStep);

    return htmlResponse(
      await renderFormPage(previewForm, {
        activeStepIndex: 0,
        answers: {},
        previewMode: true,
        routeKey,
        stepUrlOverrides: {
          [requestedStep.key]: previewUrl,
        },
      }),
      200,
      "no-store",
    );
  });

  app.get(`${previewFolderRoot}/*`, () => renderUnavailableResponse(getPreviewUnavailableAction(routeSegments)));
}

function createInitialRouteTrackingEvents(
  c: Context,
  form: InstantForm,
  routeKey: string,
  step: FormStep,
  stepIndex: number,
  answers: Record<string, string>,
  eventLogger?: InstantFormLogger,
): LifecycleTrackingEvent[] {
  const formViewEvent = createLifecycleTrackingEvent({
    form,
    routeKey,
    kind: "formView",
    answers,
    eventId: crypto.randomUUID(),
    eventSourceUrl: c.req.raw.url,
    requireServerBuilt: true,
  });
  scheduleTrackingServerCallback(c, form, routeKey, formViewEvent, {
    answers,
    logger: eventLogger,
  });

  const postHogPageViewEvent = createLifecycleTrackingEvent({
    form,
    routeKey,
    kind: "postHogPageView",
    step,
    stepIndex,
    answers,
    eventId: crypto.randomUUID(),
    eventSourceUrl: c.req.raw.url,
    requireServerBuilt: true,
  });
  scheduleTrackingServerCallback(c, form, routeKey, postHogPageViewEvent, {
    answers,
    step,
    stepIndex,
    logger: eventLogger,
  });

  const stepViewEvent = createLifecycleTrackingEvent({
    form,
    routeKey,
    kind: "stepView",
    step,
    stepIndex,
    answers,
    eventId: crypto.randomUUID(),
    eventSourceUrl: c.req.raw.url,
    requireServerBuilt: true,
  });
  scheduleTrackingServerCallback(c, form, routeKey, stepViewEvent, {
    answers,
    step,
    stepIndex,
    logger: eventLogger,
  });

  if (step.kind !== "trusted_form_consent") {
    return [];
  }

  const lifecycleEvent = createLifecycleTrackingEvent({
    form,
    routeKey,
    kind: "trustedFormSubstepView",
    step,
    stepIndex,
    extra: { trusted_form_substep: "review" },
    answers,
    browserIds: getRouteMetaBrowserIds(c),
    eventId: crypto.randomUUID(),
    eventSourceUrl: c.req.raw.url,
    requireServerBuilt: true,
  });

  scheduleTrackingServerCallback(c, form, routeKey, lifecycleEvent, {
    answers,
    step,
    stepIndex,
    logger: eventLogger,
  });

  return lifecycleEvent ? [lifecycleEvent] : [];
}

function getRouteMetaBrowserIds(c: Context): {
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  eventSourceUrl: string;
} {
  const url = new URL(c.req.raw.url);
  const fbp = getCookie(c, "_fbp");
  const fbc = getCookie(c, "_fbc");
  const fbclid = url.searchParams.get("fbclid")?.trim() || undefined;

  return {
    eventSourceUrl: c.req.raw.url,
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
    ...(fbclid ? { fbclid } : {}),
  };
}

async function executeRouteAction(
  c: Context,
  action: FormRouteAction,
  redirectPrefix?: string,
  preferPrebuiltUnavailable = false,
): Promise<Response> {
  if (action.type === "redirect") {
    return redirectNoStore(c, appendQueryParams(getRedirectTarget(action.to, redirectPrefix), getIncomingQueryParams(c)));
  }

  if (action.type === "quote_entry") {
    return htmlResponse(await renderQuoteEntryPage(action.content, action.selection, new URL(c.req.url).search), 200, "no-store");
  }
  if (action.type === "generic_state") {
    const stateSegment = c.req.path.split("/")[2]?.toUpperCase();
    if (!US_STATES.some((state) => state.code === stateSegment)) return renderUnavailableResponse(action.unavailable);
    const params = new URLSearchParams(getIncomingQueryParams(c));
    params.set("state", stateSegment!);
    return redirectNoStore(c, appendQueryParams(action.to, params));
  }
  return renderUnavailableResponse(action, preferPrebuiltUnavailable);
}

async function renderUnavailableResponse(action: UnavailableRouteAction, preferPrebuilt = false): Promise<Response> {
  const prebuiltHtml = preferPrebuilt ? await readPrebuiltUnavailablePage() : undefined;

  return htmlResponse(prebuiltHtml ?? (await renderUnavailablePage(getUnavailablePageContent(action))), action.status);
}

function getUnavailablePageContent(action: UnavailableRouteAction): UnavailablePageContent {
  return {
    locale: action.locale,
    title: action.title,
    message: action.message,
    cta: action.cta,
  };
}

function createStepUrlOverrides(routeSegments: readonly string[], form: InstantForm): Record<string, string> {
  return Object.fromEntries(
    form.steps.map((stepDefinition) => [stepDefinition.key, getPublicStepUrl(routeSegments, stepDefinition)]),
  );
}

function getPublicStepUrl(routeSegments: readonly string[], stepDefinition: FormStep): string {
  return `${getFolderRoot(routeSegments)}/${getStepSlug(stepDefinition)}`;
}

function captureFlowAttribution(c: Context, form: InstantForm): AttributionCookieCollector {
  const collector = createAttributionCookieCollector(c);

  form.attribution?.capture?.({
    url: new URL(c.req.url),
    now: new Date(),
    cookies: collector.cookies,
  });

  return collector;
}

function redirectToFlowUrl(
  c: Context,
  form: InstantForm,
  target: string,
  attribution: AttributionCookieCollector,
): Response {
  return attribution.applyTo(
    redirectNoStore(c, appendQueryParams(target, getPreservedFlowQueryParams(c, form))),
  );
}

function getIncomingQueryParams(c: Context): URLSearchParams {
  return new URL(c.req.url).searchParams;
}

function getPreservedFlowQueryParams(c: Context, form: InstantForm): URLSearchParams {
  const sourceQueryParams = new URL(c.req.url).searchParams;
  const preservedQueryParams = new URLSearchParams();

  for (const queryParam of form.attribution?.preserveQueryParams ?? []) {
    for (const value of sourceQueryParams.getAll(queryParam)) {
      preservedQueryParams.append(queryParam, value);
    }
  }

  return preservedQueryParams;
}

function appendQueryParams(target: string, queryParams: URLSearchParams): string {
  if ([...queryParams].length === 0) {
    return target;
  }

  const targetUrl = new URL(target, "http://instant.local");
  for (const [key, value] of queryParams) {
    targetUrl.searchParams.append(key, value);
  }

  if (/^https?:\/\//u.test(target)) {
    return targetUrl.toString();
  }

  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
}

function getPreviewStepUrl(routeSegments: readonly string[], stepDefinition: FormStep): string {
  return `/${RESERVED_PREVIEW_FOLDER}${getPublicStepUrl(routeSegments, stepDefinition)}`;
}

function getFolderRoot(routeSegments: readonly string[]): string {
  return `/${routeSegments.join("/")}`;
}

function getStepAt(form: InstantForm, index: number): FormStep {
  const stepDefinition = form.steps[index];

  if (!stepDefinition) {
    throw new Error(`Missing step at index ${index}.`);
  }

  return stepDefinition;
}

function normalizeRouteNodes(input: Record<string, FormRouteNodeInput>): Readonly<Record<string, FormRouteNode>> {
  return Object.fromEntries(Object.entries(input).map(([segment, node]) => [segment, normalizeRouteNode(segment, node)]));
}

function normalizeRouteNode(segment: string, input: FormRouteNodeInput | FormRouteAction | undefined): FormRouteNode {
  assertValidFormRouteSegment(segment);

  if (!input) {
    throw new Error(`Form route segment "${segment}" must define a flow or route group.`);
  }

  if (isInstantForm(input)) {
    return { type: "flow", form: input };
  }

  if (isFormRouteAction(input)) {
    return { type: "action", action: input };
  }

  if (!isRecord(input)) {
    throw new Error(`Form route segment "${segment}" must define a flow or route group.`);
  }

  if (input.notFound !== undefined && !isFormRouteAction(input.notFound)) {
    throw new Error(`Route group "${segment}" must use a route action for "${NOT_FOUND_KEY}".`);
  }

  const index = input.index === undefined ? undefined
    : isInstantForm(input.index) ? { type: "flow" as const, form: input.index }
    : isFormRouteAction(input.index) ? { type: "action" as const, action: input.index }
    : undefined;
  if (input.index !== undefined && !index) throw new Error("Route group index must be a flow or route action.");
  if (input.queryPrefill && index?.type !== "flow") throw new Error("Query prefill requires a group index flow.");
  for (const [queryParam, key] of Object.entries(input.queryPrefill ?? {})) {
    if (!queryParam || !index || index.type !== "flow" || !index.form.steps.some((step) => step.key === key && step.kind === "autocomplete")) {
      throw new Error("Query prefill must reference an autocomplete step.");
    }
  }
  const childEntries = Object.entries(input).filter(([key]) => !["index", "queryPrefill", NOT_FOUND_KEY].includes(key));
  if (index?.type === "flow") {
    const flowSlugs = new Set([...index.form.steps.map(getStepSlug), index.form.postSubmit.slug]);
    for (const [childSegment] of childEntries) {
      if (flowSlugs.has(childSegment)) {
        throw new Error(`Route group "${segment}" child "${childSegment}" conflicts with its index flow.`);
      }
    }
  }

  if (childEntries.length === 0 && !index) {
    throw new Error(`Route group "${segment}" must define at least one child route.`);
  }

  return {
    type: "group",
    index,
    queryPrefill: input.queryPrefill,
    children: Object.fromEntries(
      childEntries.map(([childSegment, childInput]) => [childSegment, normalizeRouteNode(childSegment, childInput as FormRouteNodeInput)]),
    ),
    notFound: input.notFound,
  };
}

function assertValidFormRouteSegment(segment: string): void {
  if (segment === RESERVED_PREVIEW_FOLDER) {
    throw new Error(`"${RESERVED_PREVIEW_FOLDER}" is reserved for platform previews.`);
  }

  if (segment === NOT_FOUND_KEY) {
    throw new Error(`"${NOT_FOUND_KEY}" is reserved for route group fallbacks.`);
  }

  if (!FORM_ROUTE_FOLDER_PATTERN.test(segment)) {
    throw new Error(`Form route segment "${segment}" must be a lowercase static URL segment.`);
  }
}

function getRedirectTarget(to: string, redirectPrefix: string | undefined): string {
  if (!redirectPrefix || !to.startsWith("/") || to.startsWith(`/${redirectPrefix}/`)) {
    return to;
  }

  return `/${redirectPrefix}${to}`;
}

function getPreviewUnavailableAction(routeSegments: readonly string[]): UnavailableRouteAction {
  return unavailable({
    status: 404,
    locale: "en",
    title: "Page not found",
    message: "This page does not exist or is no longer available.",
    cta: {
      label: "Go to the form",
      href: getFolderRoot(routeSegments),
    },
  });
}

function isInstantForm(value: unknown): value is InstantForm {
  return isRecord(value) && typeof value.name === "string" && Array.isArray(value.steps);
}

function isFormRouteAction(value: unknown): value is FormRouteAction {
  return isRecord(value) && ["redirect", "unavailable", "quote_entry", "generic_state"].includes(String(value.type));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function registerRouteAction(app: Hono, path: string, action: FormRouteAction, routes: FormRoutes): void {
  app.get(path, (c) => executeRouteAction(c, action));
  if (action.type !== "quote_entry" || !action.selection) return;
  app.post(path, async (c) => {
    const body = await c.req.parseBody();
    const product = action.content.products.find((candidate) => candidate.key === body.product);
    const entry = product ? getFormRouteByRouteKey(routes, product.routeKey) : undefined;
    const welcome = entry?.form.steps[0];
    if (!entry || welcome?.kind !== "interstitial" || welcome.interstitialTiming !== "welcome") {
      return htmlResponse(await renderQuoteEntryPage(action.content, true, new URL(c.req.url).search), 400, "no-store");
    }
    const answers = readCheckpointAnswers(c, entry.form, entry.routeKey);
    const validation = validateCheckpointAnswer(entry.form, welcome, welcome.completionAnswer);
    if (!validation.ok) throw new Error("Invalid authored welcome completion answer.");
    answers[welcome.key] = validation.answer;
    setCheckpointAnswers(c, entry.routeKey, sanitizeCheckpointAnswers(entry.form, answers));
    c.header("Cache-Control", "no-store");
    return c.redirect(appendQueryParams(getFolderRoot(entry.routeSegments), getIncomingQueryParams(c)), 303);
  });
}
