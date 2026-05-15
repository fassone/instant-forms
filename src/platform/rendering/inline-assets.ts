export type InlineAssetMode = "source" | "built";

const productionCssTokenMap = {
  "--brand-navy": "--a",
  "--brand-blue": "--b",
  "--brand-pink": "--c",
  "--brand-cream": "--d",
  "--bg": "--e",
  "--surface": "--f",
  "--text": "--g",
  "--muted": "--h",
  "--border": "--i",
  "--primary": "--j",
  "--primary-dark": "--k",
  "--accent": "--l",
  "--danger": "--m",
  "--shadow": "--n",
} as const;

const productionClassTokenMap = {
  "autocomplete-field": "a",
  "autocomplete-scroll-fade-bottom": "b",
  "autocomplete-scroll-fade-top": "c",
  "autocomplete-scroll-fade": "d",
  "autocomplete-suggestion-value": "e",
  "autocomplete-suggestion": "f",
  "autocomplete-suggestions-shell": "g",
  "autocomplete-suggestions": "h",
  "consent-acceptance": "ba",
  "consent-card": "av",
  "consent-check": "aw",
  "consent-checkbox": "ax",
  "consent-copy": "ay",
  "consent-summary": "az",
  "area-pill": "i",
  "brand-identity": "j",
  "brand-logo": "k",
  "brand-trust": "l",
  brand: "m",
  "button-primary": "n",
  "button-secondary": "o",
  button: "p",
  "error-modal-close": "q",
  "error-modal-message": "r",
  "error-modal-panel": "s",
  "error-modal-title": "t",
  "error-modal": "u",
  "form-panel": "v",
  "is-fading-in": "w",
  "is-fading-out": "x",
  "is-success": "y",
  "is-visible": "z",
  "matching-benefit": "aa",
  "matching-content": "ab",
  "matching-status": "ac",
  "matching-success-line": "ad",
  option: "ae",
  "option-index": "af",
  "option-text": "ag",
  options: "ah",
  "progress-area": "ai",
  "progress-bar": "aj",
  "progress-meta": "ak",
  "progress-shell": "al",
  "question-title": "am",
  shell: "an",
  step: "ao",
  "step-count": "ap",
  thanks: "aq",
  "text-input": "ar",
  unavailable: "as",
  "unavailable-action": "at",
  actions: "au",
} as const;

const productionIdTokenMap = {
  "back-button": "b",
  "error-modal-close": "c",
  "error-modal-message": "d",
  "error-modal-title": "e",
  "error-modal": "f",
  "lead-form": "g",
  "next-button": "h",
  "progress-bar": "i",
  steps: "j",
  thanks: "k",
} as const;

export function getInlineAssetMode(environment = process.env.NODE_ENV): InlineAssetMode {
  return environment === "production" ? "built" : "source";
}

export async function prepareInlineAssetHtml(html: string, mode: InlineAssetMode = getInlineAssetMode()): Promise<string> {
  if (mode === "source") {
    return html;
  }

  const { minify } = await import("html-minifier-terser");

  return minify(applyProductionTokens(html), {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: false,
    minifyCSS: true,
    minifyJS: {
      compress: true,
      mangle: true,
    },
    removeAttributeQuotes: false,
    removeComments: true,
    removeEmptyAttributes: false,
    removeOptionalTags: false,
    removeRedundantAttributes: true,
    sortAttributes: true,
    sortClassName: true,
  });
}

export function buildInlineCss(css: string): string {
  return tokenizeCssCustomProperties(css)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

export function tokenizeCssCustomProperties(css: string): string {
  return getSortedEntries(productionCssTokenMap).reduce(
    (tokenizedCss, [sourceToken, builtToken]) =>
      tokenizedCss.replace(new RegExp(escapeRegExp(sourceToken), "g"), builtToken),
    css,
  );
}

export function applyProductionTokens(html: string): string {
  return tokenizeCssCustomProperties(tokenizeSelectors(html));
}

export function applyProductionTokensToScript(script: string): string {
  return tokenizeCssCustomProperties(tokenizeScriptSelectorLiterals(script));
}

function tokenizeSelectors(html: string): string {
  const classEntries = getSortedEntries(productionClassTokenMap);
  const idEntries = getSortedEntries(productionIdTokenMap);
  const htmlWithIds = idEntries.reduce(
    (htmlWithIdTokens, [sourceId, builtId]) => replaceIdToken(htmlWithIdTokens, sourceId, builtId),
    html,
  );

  return classEntries.reduce(
    (htmlWithClasses, [sourceClass, builtClass]) => replaceClassToken(htmlWithClasses, sourceClass, builtClass),
    htmlWithIds,
  );
}

function tokenizeScriptSelectorLiterals(script: string): string {
  const idEntries = getSortedEntries(productionIdTokenMap);
  const classEntries = getSortedEntries(productionClassTokenMap);
  const scriptWithIdTokens = idEntries.reduce(
    (scriptWithTokens, [sourceId, builtId]) => replaceScriptIdToken(scriptWithTokens, sourceId, builtId),
    script,
  );

  return classEntries.reduce((scriptWithTokens, [sourceClass, builtClass]) => {
    if (sourceClass === "button") {
      return scriptWithTokens;
    }

    return replaceScriptClassToken(scriptWithTokens, sourceClass, builtClass);
  }, scriptWithIdTokens);
}

function replaceScriptClassToken(script: string, sourceClass: string, builtClass: string): string {
  return replaceScriptStringLiteralToken(script, sourceClass, builtClass)
    .replace(new RegExp(`\\.${escapeRegExp(sourceClass)}(?=[^a-zA-Z0-9_-])`, "g"), `.${builtClass}`)
    .replace(new RegExp(`class=\\\\\\"${escapeRegExp(sourceClass)}\\\\\\"`, "g"), `class=\\"${builtClass}\\"`)
    .replace(new RegExp(`class="${escapeRegExp(sourceClass)}"`, "g"), `class="${builtClass}"`);
}

function replaceScriptIdToken(script: string, sourceId: string, builtId: string): string {
  return replaceScriptStringLiteralToken(script, sourceId, builtId).replace(
    new RegExp(`#${escapeRegExp(sourceId)}(?=[^a-zA-Z0-9_-])`, "g"),
    `#${builtId}`,
  );
}

function replaceScriptStringLiteralToken(script: string, sourceToken: string, builtToken: string): string {
  return script.replace(new RegExp(`(["'])${escapeRegExp(sourceToken)}\\1`, "g"), `$1${builtToken}$1`);
}

function replaceClassToken(html: string, sourceClass: string, builtClass: string): string {
  const htmlWithStaticClassTokens = html
    .replace(/\bclass="([^"]*)"/g, (_match, classValue: string) => {
      const mappedClassValue = classValue
        .split(/\s+/)
        .filter(Boolean)
        .map((className) => (className === sourceClass ? builtClass : className))
        .join(" ");

      return `class="${mappedClassValue}"`;
    })
    .replace(new RegExp(`\\.${escapeRegExp(sourceClass)}(?=[^a-zA-Z0-9_-])`, "g"), `.${builtClass}`)
    .replace(new RegExp(`class=\\\\\\"${escapeRegExp(sourceClass)}\\\\\\"`, "g"), `class=\\"${builtClass}\\"`);

  if (sourceClass === "button") {
    return htmlWithStaticClassTokens;
  }

  return htmlWithStaticClassTokens
    .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (match, attributes: string, scriptBody: string) => {
      const tokenizedScript = scriptBody.replace(
        new RegExp(`(["'])${escapeRegExp(sourceClass)}\\1`, "g"),
        `$1${builtClass}$1`,
      );

      return `<script${attributes}>${tokenizedScript}</script>`;
    });
}

function replaceIdToken(html: string, sourceId: string, builtId: string): string {
  return html
    .replace(new RegExp(`\\bid="${escapeRegExp(sourceId)}"`, "g"), `id="${builtId}"`)
    .replace(new RegExp(`\\baria-labelledby="${escapeRegExp(sourceId)}"`, "g"), `aria-labelledby="${builtId}"`)
    .replace(new RegExp(`\\baria-describedby="${escapeRegExp(sourceId)}"`, "g"), `aria-describedby="${builtId}"`)
    .replace(new RegExp(`#${escapeRegExp(sourceId)}(?=[^a-zA-Z0-9_-])`, "g"), `#${builtId}`)
    .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (match, attributes: string, scriptBody: string) => {
      const tokenizedScript = scriptBody.replace(
        new RegExp(`(["'])${escapeRegExp(sourceId)}\\1`, "g"),
        `$1${builtId}$1`,
      );

      return `<script${attributes}>${tokenizedScript}</script>`;
    });
}

function getSortedEntries<TMap extends Record<string, string>>(map: TMap): Array<[string, TMap[keyof TMap]]> {
  return Object.entries(map).sort(([left], [right]) => right.length - left.length) as Array<
    [string, TMap[keyof TMap]]
  >;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
