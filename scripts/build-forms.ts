import { mkdir, rm, writeFile } from "node:fs/promises";
import { copyLibFiles } from "@qwik.dev/partytown/utils";
import path from "node:path";

import { formRoutes } from "../src/authoring/routes/registry";
import { getStepSlug, type FormStep, type InstantForm } from "../src/platform/flow";
import { getFormRouteBuildEntries } from "../src/platform/routing";
import {
  DIST_FORMS_ROOT,
  FORM_CONFIG_JSON_PLACEHOLDER,
  FORM_CONFIG_PLACEHOLDER_EXPRESSION,
  buildTransitionAsset,
  getPrebuiltFormStepHtmlPath,
  getPrebuiltTransitionAssetPath,
  getPrebuiltUnavailableHtmlPath,
  getTransitionAssetManifestRouteKey,
  getTransitionAssetUrl,
  renderFormPage,
  renderUnavailablePage,
} from "../src/platform/rendering";
import { getPartytownLibDistPath } from "../src/platform/scripts";
import { getInlineAssetMode } from "../src/platform/rendering/inline-assets";

type BuiltPageRecord = {
  path: string;
  route: string;
  bytes: number;
};

if (getInlineAssetMode() !== "built") {
  throw new Error("Run build:forms with NODE_ENV=production so production inline assets are generated.");
}

await rm(path.join(process.cwd(), DIST_FORMS_ROOT), { recursive: true, force: true });

const builtPages: BuiltPageRecord[] = [];
const builtTransitionAssets: Record<string, string> = {};

await copyLibFiles(getPartytownLibDistPath());

for (const entry of getFormRouteBuildEntries(formRoutes)) {
  const stepUrlOverrides = createStepUrlOverrides(entry.routeSegments, entry.form);
  const transitionAsset = await buildTransitionAsset(entry.form, entry.routeSegments, stepUrlOverrides);
  const transitionAssetUrl = getTransitionAssetUrl(transitionAsset.hash);
  const transitionAssetPath = getPrebuiltTransitionAssetPath(transitionAsset.hash);

  await writePage(transitionAssetPath, transitionAsset.body);
  builtTransitionAssets[getTransitionAssetManifestRouteKey(entry.routeSegments)] = transitionAssetUrl;

  for (const [stepIndex, stepDefinition] of entry.form.steps.entries()) {
    const outputPath = getPrebuiltFormStepHtmlPath(entry.routeSegments, getStepSlug(stepDefinition));
    const html = await renderFormPage(entry.form, {
      activeStepIndex: stepIndex,
      answers: {},
      formConfigExpression: FORM_CONFIG_PLACEHOLDER_EXPRESSION,
      routeKey: entry.routeKey,
      stepUrlOverrides,
      transitionAssetUrl,
    });

    assertBuiltFormHtml(html, outputPath);
    await writePage(outputPath, html);
    builtPages.push({
      path: outputPath,
      route: `/${[...entry.routeSegments, getStepSlug(stepDefinition)].join("/")}`,
      bytes: getByteLength(html),
    });
  }
}

const unavailableHtml = await renderUnavailablePage({
  title: formRoutes.notFound.title,
  message: formRoutes.notFound.message,
  cta: formRoutes.notFound.cta,
});
const unavailablePath = getPrebuiltUnavailableHtmlPath();

assertBuiltInlineAssets(unavailableHtml, "unavailable page");
await writePage(unavailablePath, unavailableHtml);
await writeManifest(builtPages, builtTransitionAssets);

const totalBytes = builtPages.reduce((total, page) => total + page.bytes, getByteLength(unavailableHtml));

console.log(
  [
    `Inline asset mode: ${getInlineAssetMode()}`,
    `Built form pages: ${builtPages.length}`,
    `Built transition assets: ${Object.keys(builtTransitionAssets).length}`,
    `Built Partytown assets: ${path.relative(process.cwd(), getPartytownLibDistPath())}`,
    `Built unavailable page: ${path.relative(process.cwd(), unavailablePath)}`,
    `Output: ${DIST_FORMS_ROOT}`,
    `Total HTML: ${totalBytes} bytes`,
  ].join("\n"),
);

function createStepUrlOverrides(routeSegments: readonly string[], form: InstantForm): Record<string, string> {
  return Object.fromEntries(
    form.steps.map((stepDefinition: FormStep) => [
      stepDefinition.key,
      `/${[...routeSegments, getStepSlug(stepDefinition)].join("/")}`,
    ]),
  );
}

async function writePage(outputPath: string, html: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
}

async function writeManifest(
  pages: readonly BuiltPageRecord[],
  transitionAssets: Record<string, string>,
): Promise<void> {
  const manifestPath = path.join(process.cwd(), DIST_FORMS_ROOT, "manifest.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    transitionAssets,
    pages: pages.map((page) => ({
      route: page.route,
      path: path.relative(process.cwd(), page.path),
      bytes: page.bytes,
    })),
  };

  await writePage(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function assertBuiltFormHtml(html: string, label: string): void {
  assertBuiltInlineAssets(html, label);

  if (!html.includes(JSON.stringify(FORM_CONFIG_JSON_PLACEHOLDER))) {
    throw new Error(`${label} is missing the production form config placeholder.`);
  }
}

function assertBuiltInlineAssets(html: string, label: string): void {
  if (html.includes("--brand-navy") || html.includes("var(--brand-navy)")) {
    throw new Error(`${label} still contains readable CSS custom property tokens.`);
  }

  if (html.includes('class="form-panel"') || html.includes('id="lead-form"')) {
    throw new Error(`${label} still contains readable internal selectors.`);
  }

  if (html.includes("\n      :root")) {
    throw new Error(`${label} still contains unbuilt CSS indentation.`);
  }
}

function getByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
