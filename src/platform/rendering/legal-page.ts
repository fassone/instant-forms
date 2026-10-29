import type { FormLegalLink } from "../flow";
import { prepareInlineAssetHtml } from "./inline-assets";
import { escapeHtml, renderLegalLinks } from "./legal-links";
import { renderMarkdownToHtml } from "./markdown";

export type LegalPageContent = {
  locale: string;
  brandName: string;
  title: string;
  sampleNotice: string;
  introduction: string;
  contentsLabel: string;
  returnLabel: string;
  sections: readonly { id: string; title: string; body: string }[];
  legalLinks: readonly FormLegalLink[];
};

export async function renderLegalPage(content: LegalPageContent, returnTo: string): Promise<string> {
  const returnLink = `<a class="legal-return" data-legal-return href="${escapeHtml(returnTo)}">${escapeHtml(content.returnLabel)}</a>`;
  return prepareInlineAssetHtml(`<!doctype html>
<html lang="${escapeHtml(content.locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="same-origin">
  <title>${escapeHtml(content.title)} | ${escapeHtml(content.brandName)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111427; background: #073b8e; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 24px; }
    .legal-document { max-width: 800px; margin: 0 auto; padding: 48px; background: #fffdf4; border: 1px solid #d9dff0; border-radius: 8px; }
    .legal-logo { width: 236px; max-width: 100%; height: auto; aspect-ratio: 236 / 73; display: block; margin-bottom: 28px; }
    h1 { font-size: 32px; line-height: 1.2; margin: 28px 0 20px; letter-spacing: 0; }
    h2 { font-size: 22px; line-height: 1.35; margin: 36px 0 14px; letter-spacing: 0; }
    p, li { font-size: 16px; line-height: 1.75; }
    p { margin: 0 0 18px; }
    ul, ol { padding-left: 24px; }
    li { margin: 8px 0; }
    a { color: #073b8e; text-underline-offset: 3px; overflow-wrap: anywhere; }
    a:focus-visible { outline: 3px solid #064df6; outline-offset: 4px; }
    .legal-notice { border-left: 4px solid #f80057; padding: 12px 16px; background: #fff0f4; font-weight: 650; }
    .legal-contents { border-block: 1px solid #d9dff0; margin-block: 28px; padding-bottom: 18px; }
    .legal-contents h2 { margin-top: 20px; }
    .legal-contents a, .legal-return { display: inline-block; padding-block: 8px; }
    .legal-contents li { margin: 0; }
    .legal-return { font-size: 16px; }
    section { scroll-margin-top: 24px; overflow-wrap: anywhere; }
    .legal-document footer { margin-top: 40px; border-top: 1px solid #d9dff0; padding-top: 24px; }
    .legal-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 24px; margin-top: 24px; }
    .legal-links a { display: inline-flex; align-items: center; min-height: 44px; font-size: 14px; }
    @media (max-width: 600px) {
      body { padding: 0; background: #fffdf4; }
      .legal-document { border: 0; border-radius: 0; padding: calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom)); }
      h1 { font-size: 28px; }
      h2 { font-size: 21px; }
      .legal-logo { width: 200px; }
    }
  </style>
</head>
<body>
  <main class="legal-document" data-legal-page>
    <header><img class="legal-logo" src="/assets/logo.webp" width="236" height="73" alt="${escapeHtml(content.brandName)}">${returnLink}
      <h1>${escapeHtml(content.title)}</h1>
      <p class="legal-notice" data-legal-sample>${escapeHtml(content.sampleNotice)}</p>
      ${renderMarkdownToHtml(content.introduction)}
    </header>
    <nav class="legal-contents" aria-label="${escapeHtml(content.contentsLabel)}">
      <h2>${escapeHtml(content.contentsLabel)}</h2>
      <ol>${content.sections.map((section) => `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a></li>`).join("")}</ol>
    </nav>
    ${content.sections.map((section, index) => `<section id="${escapeHtml(section.id)}"><h2>${index + 1}. ${escapeHtml(section.title)}</h2>${renderMarkdownToHtml(section.body)}</section>`).join("")}
    <footer>${returnLink}${renderLegalLinks(content.legalLinks, returnTo)}</footer>
  </main>
</body>
</html>`);
}
