import { prepareInlineAssetHtml } from "./inline-assets";
import { renderFormStyles } from "./form-styles";
import { renderWelcomeContent } from "./render-form-page";

export type QuoteEntryPage = {
  locale: string;
  pageName: string;
  desktopHeightPx: number;
  title: string;
  body: string;
  benefits: readonly string[];
  ctaLabel: string;
  selectionPath: string;
  productTitle: string;
  continueLabel: string;
  products: readonly { key: string; label: string; routeKey: string }[];
};

export async function renderQuoteEntryPage(content: QuoteEntryPage, selection: boolean, query: string): Promise<string> {
  const action = escapeHtml(content.selectionPath + query);
  const choices = content.products.map((product, index) => `
    <label class="option">
      <input type="radio" name="product" value="${escapeHtml(product.key)}" required>
      <span class="option-index">${index + 1}</span>
      <span class="option-text">${escapeHtml(product.label)}</span>
    </label>`).join("");
  return prepareInlineAssetHtml(`<!doctype html>
<html lang="${escapeHtml(content.locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(content.pageName)}</title>
    ${renderFormStyles()}
  </head>
  <body>
    <main class="shell">
      <form class="form-panel" style="--form-desktop-height: ${content.desktopHeightPx}px;" data-has-footer="true" data-active-step-kind="${selection ? "choice" : "interstitial"}" method="post" action="${action}">
        <header class="brand"><div class="brand-identity">
          <img class="brand-logo" src="/assets/logo.webp" alt="${escapeHtml(content.pageName)}" width="236" height="73">
        </div></header>
        <div class="progress-area"><div class="progress-shell" aria-hidden="true"><div class="progress-bar" style="width:10%"></div></div></div>
        <section id="steps">
          <article class="step" aria-hidden="false" data-step-kind="${selection ? "choice" : "interstitial"}"${selection ? "" : ' data-interstitial-timing="welcome"'}>
            <h1 class="question-title">${escapeHtml(selection ? content.productTitle : content.title)}</h1>
            ${selection ? '<div class="options">' + choices + '</div>' : renderWelcomeContent(content.body, content.benefits)}
          </article>
        </section>
        <footer><div class="actions actions-single actions-welcome">
          ${selection
            ? '<button class="button button-primary" type="submit">' + escapeHtml(content.continueLabel) + '</button>'
            : '<a class="button button-primary" href="' + action + '">' + escapeHtml(content.ctaLabel) + '</a>'}
        </div></footer>
      </form>
    </main>
  </body>
</html>`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}
