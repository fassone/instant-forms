import type { Context, Hono } from "hono";

import { readCheckpointAnswers } from "../app/http/cookies";
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
import { renderFormPage, renderUnavailablePage, type UnavailablePageContent } from "../rendering";

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

export function redirectTo(to: string): RedirectRouteAction {
  return { type: "redirect", to };
}

export function unavailable(input: UnavailablePageContent & { status?: number }): UnavailableRouteAction {
  return {
    type: "unavailable",
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

export function renderFormRouteNotFound(c: Context, routes: FormRoutes): Response {
  return executeRouteAction(c, routes.notFound);
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

  app.get(folderRoot, (c) => {
    const answers = readCheckpointAnswers(c, form);
    const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

    return redirectNoStore(c, getPublicStepUrl(routeSegments, resumeStep));
  });

  app.get(`${folderRoot}/:stepSlug`, (c) => {
    const stepSlug = c.req.param("stepSlug");
    const stepIndex = getStepIndexBySlug(form, stepSlug);

    if (stepIndex === -1) {
      const legacyStepIndex = getStepIndexByLegacySlug(form, stepSlug);

      if (legacyStepIndex !== -1) {
        const answers = readCheckpointAnswers(c, form);

        if (!canAccessStep(form, legacyStepIndex, answers)) {
          const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

          return redirectNoStore(c, getPublicStepUrl(routeSegments, resumeStep));
        }

        const legacyStep = getStepAt(form, legacyStepIndex);

        return redirectNoStore(c, getPublicStepUrl(routeSegments, legacyStep));
      }

      return redirectNoStore(c, folderRoot);
    }

    const answers = readCheckpointAnswers(c, form);

    if (!canAccessStep(form, stepIndex, answers)) {
      const resumeStep = getStepAt(form, getResumeStepIndex(form, answers));

      return redirectNoStore(c, getPublicStepUrl(routeSegments, resumeStep));
    }

    const requestedStep = getStepAt(form, stepIndex);

    if (requestedStep.kind === "interstitial" && answers[requestedStep.key] === requestedStep.seenAnswer) {
      const nextStep = getStepAt(form, getNextStepIndex(form, stepIndex, answers));

      return redirectNoStore(c, getPublicStepUrl(routeSegments, nextStep));
    }

    return htmlResponse(
      renderFormPage(form, {
        activeStepIndex: stepIndex,
        answers,
        stepUrlOverrides: createStepUrlOverrides(routeSegments, form),
      }),
      200,
      "no-store",
    );
  });

  app.get(`${folderRoot}/*`, (c) => redirectNoStore(c, folderRoot));
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

  app.get(previewFolderRoot, (c) => {
    const firstStep = getStepAt(form, 0);

    return redirectNoStore(c, getPreviewStepUrl(routeSegments, firstStep));
  });

  app.get(`${previewFolderRoot}/:stepSlug`, (c) => {
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
      renderFormPage(previewForm, {
        activeStepIndex: 0,
        answers: {},
        previewMode: true,
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

function executeRouteAction(c: Context, action: FormRouteAction, redirectPrefix?: string): Response {
  if (action.type === "redirect") {
    return redirectNoStore(c, getRedirectTarget(action.to, redirectPrefix));
  }

  return renderUnavailableResponse(action);
}

function renderUnavailableResponse(action: UnavailableRouteAction): Response {
  return htmlResponse(renderUnavailablePage(getUnavailablePageContent(action)), action.status);
}

function getUnavailablePageContent(action: UnavailableRouteAction): UnavailablePageContent {
  return {
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
    title: "Página no encontrada",
    message: "Esta página no existe o ya no está disponible.",
    cta: {
      label: "Ir al formulario",
      href: getFolderRoot(routeSegments),
    },
  });
}

function isInstantForm(value: unknown): value is InstantForm {
  return (
    isRecord(value) &&
    typeof value.areaCode === "string" &&
    typeof value.id === "string" &&
    Array.isArray(value.steps)
  );
}

function isFormRouteAction(value: unknown): value is FormRouteAction {
  return isRecord(value) && (value.type === "redirect" || value.type === "unavailable");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
