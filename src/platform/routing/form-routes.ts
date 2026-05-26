import type { Context, Hono } from "hono";

import {
  createAttributionCookieCollector,
  type AttributionCookieCollector,
  clearPostSubmitState,
  readCheckpointAnswers,
  readPostSubmitState,
} from "../app/http/cookies";
import { htmlResponse, redirectNoStore } from "../app/http/responses";
import {
  canAccessStep,
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
} from "../rendering";

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

export type FormRouteAction = RedirectRouteAction | UnavailableRouteAction;

export type FormRouteNodeInput = InstantForm | FormRouteGroupInput;

export type FormRouteGroupInput = {
  notFound?: FormRouteAction;
} & {
  [segment: string]: FormRouteNodeInput | FormRouteAction | undefined;
};

export type FormRouteFlowNode = {
  type: "flow";
  form: InstantForm;
};

export type FormRouteGroupNode = {
  type: "group";
  children: Readonly<Record<string, FormRouteNode>>;
  notFound?: FormRouteAction;
};

export type FormRouteNode = FormRouteFlowNode | FormRouteGroupNode;

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

export function registerFormRoutePages(app: Hono, routes: FormRoutes): void {
  app.get("/", (c) => executeRouteAction(c, routes.index));

  for (const [folder, node] of Object.entries(routes.folders)) {
    registerPublicRouteNode(app, [folder], node, routes.notFound);
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

  return Object.entries(node.children).flatMap(([childSegment, childNode]) =>
    getFormRouteNodeBuildEntries([...routeSegments, childSegment], childNode),
  );
}

function registerPublicRouteNode(
  app: Hono,
  routeSegments: readonly string[],
  node: FormRouteNode,
  inheritedFallback: FormRouteAction,
): void {
  if (node.type === "flow") {
    registerPublicFormFolder(app, routeSegments, node.form);
    return;
  }

  const folderRoot = getFolderRoot(routeSegments);
  const fallback = node.notFound ?? inheritedFallback;

  app.get(folderRoot, (c) => executeRouteAction(c, fallback));

  for (const [childSegment, childNode] of Object.entries(node.children)) {
    registerPublicRouteNode(app, [...routeSegments, childSegment], childNode, fallback);
  }

  app.get(`${folderRoot}/*`, (c) => executeRouteAction(c, fallback));
}

function registerPublicFormFolder(app: Hono, routeSegments: readonly string[], form: InstantForm): void {
  const folderRoot = getFolderRoot(routeSegments);
  const routeKey = getFormRouteKey(routeSegments);

  app.get(folderRoot, (c) => {
    const attribution = captureFlowAttribution(c, form);
    const answers = readCheckpointAnswers(c, form, routeKey);
    const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

    return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, resumeStep), attribution);
  });

  app.get(getFormRoutePostSubmitUrl(routeSegments, form), async (c) => {
    const attribution = captureFlowAttribution(c, form);
    const postSubmitState = readPostSubmitState(c, routeKey);

    if (!postSubmitState) {
      return redirectToFlowUrl(c, form, folderRoot, attribution);
    }

    clearPostSubmitState(c, routeKey);
    c.header("Cache-Control", "no-store");

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

    if (stepIndex === -1) {
      const legacyStepIndex = getStepIndexByLegacySlug(form, stepSlug);

      if (legacyStepIndex !== -1) {
        const answers = readCheckpointAnswers(c, form, routeKey);

        if (!canAccessStep(form, legacyStepIndex, answers)) {
          const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

          return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, resumeStep), attribution);
        }

        const legacyStep = getStepAt(form, legacyStepIndex);

        return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, legacyStep), attribution);
      }

      return redirectToFlowUrl(c, form, folderRoot, attribution);
    }

    const answers = readCheckpointAnswers(c, form, routeKey);

    if (!canAccessStep(form, stepIndex, answers)) {
      const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

      return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, resumeStep), attribution);
    }

    const requestedStep = getStepAt(form, stepIndex);

    if (requestedStep.kind === "interstitial" && answers[requestedStep.key] === requestedStep.seenAnswer) {
      const nextStep = getStepAt(form, getNextStepIndex(form, stepIndex, answers));

      return redirectToFlowUrl(c, form, getPublicStepUrl(routeSegments, nextStep), attribution);
    }

    const renderOptions = {
      activeStepIndex: stepIndex,
      answers,
      routeKey,
      stepUrlOverrides: createStepUrlOverrides(routeSegments, form),
    };
    const prebuiltHtml = await readPrebuiltFormPage(form, {
      ...renderOptions,
      routeSegments,
    });

    return attribution.applyTo(
      htmlResponse(
        prebuiltHtml ??
          (await renderFormPage(form, {
            ...renderOptions,
          })),
        200,
        "no-store",
      ),
    );
  });

  app.get(`${folderRoot}/*`, (c) => {
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
  const fallback = node.notFound ?? inheritedFallback;

  app.get(previewFolderRoot, (c) => executeRouteAction(c, fallback, RESERVED_PREVIEW_FOLDER));

  for (const [childSegment, childNode] of Object.entries(node.children)) {
    registerPreviewRouteNode(app, [...routeSegments, childSegment], childNode, fallback);
  }

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

async function executeRouteAction(
  c: Context,
  action: FormRouteAction,
  redirectPrefix?: string,
  preferPrebuiltUnavailable = false,
): Promise<Response> {
  if (action.type === "redirect") {
    return redirectNoStore(c, appendQueryParams(getRedirectTarget(action.to, redirectPrefix), getIncomingQueryParams(c)));
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
    throw new Error(`Form route segment "${segment}" must define a flow or route group, not a route action.`);
  }

  if (!isRecord(input)) {
    throw new Error(`Form route segment "${segment}" must define a flow or route group.`);
  }

  if (input.notFound !== undefined && !isFormRouteAction(input.notFound)) {
    throw new Error(`Route group "${segment}" must use a route action for "${NOT_FOUND_KEY}".`);
  }

  const childEntries = Object.entries(input).filter(([childSegment]) => childSegment !== NOT_FOUND_KEY);

  if (childEntries.length === 0) {
    throw new Error(`Route group "${segment}" must define at least one child route.`);
  }

  return {
    type: "group",
    children: Object.fromEntries(
      childEntries.map(([childSegment, childInput]) => [childSegment, normalizeRouteNode(childSegment, childInput)]),
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
  return isRecord(value) && (value.type === "redirect" || value.type === "unavailable");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
