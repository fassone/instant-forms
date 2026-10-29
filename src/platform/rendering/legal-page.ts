import type { FormLegalLink } from "../flow";
import { prepareInlineAssetHtml } from "./inline-assets";
import { escapeHtml, renderLegalLinks } from "./legal-links";
import { renderMarkdownToHtml } from "./markdown";

export type LegalPageContent = {
  locale: string;
  brandName: string;
  title: string;
  notice?: { kind: "sample" | "important"; text: string };
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
    :root { --legal-cta-height: 70px; color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111427; background: #073b8e; scroll-padding-bottom: calc(var(--legal-cta-height) + 64px + env(safe-area-inset-bottom)); }
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
    .legal-contents a { display: inline-block; padding-block: 8px; }
    .legal-contents li { margin: 0; }
    .legal-return { display: flex; align-items: center; justify-content: center; width: 100%; min-height: var(--legal-cta-height); padding: 12px 24px; border: 1px solid transparent; border-radius: 8px; background: #f80057; color: #ffffff; font-size: 1.4rem; font-weight: 700; line-height: 1.3; letter-spacing: 0; text-align: center; text-decoration: none; }
    .legal-return:hover { background: #d9004d; }
    section { scroll-margin-top: 24px; overflow-wrap: anywhere; }
    .legal-return-area { position: sticky; bottom: 0; z-index: 1; margin-top: 32px; padding: 16px 0 calc(16px + env(safe-area-inset-bottom)); background: #fffdf4; }
    .legal-return-area::before { content: ""; position: absolute; inset: -32px 0 auto; height: 32px; background: linear-gradient(to bottom, rgba(255, 253, 244, 0), #fffdf4); pointer-events: none; }
    .legal-site-footer { max-width: 800px; margin: 12px auto 0; }
    .legal-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 24px; }
    .legal-links a { display: inline-flex; align-items: center; min-height: 44px; color: #fffdf4; font-size: 14px; line-height: 1.4; }
    .legal-links a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
    @media (max-width: 600px) {
      :root { --legal-cta-height: 56px; }
      body { padding: 0; background: #fffdf4; }
      .legal-document { border: 0; border-radius: 0; padding: calc(24px + env(safe-area-inset-top)) 20px 24px; }
      h1 { font-size: 28px; }
      h2 { font-size: 21px; }
      .legal-logo { width: 200px; }
      .legal-return { font-size: 18px; }
      .legal-links { padding: 0 12px max(8px, env(safe-area-inset-bottom)); gap: 0 16px; }
      .legal-links a { color: #4d5878; font-size: 12px; }
    }
  </style>
</head>
<body>
  <main class="legal-document" data-legal-page>
    <header><img class="legal-logo" src="/assets/logo.webp" width="236" height="73" alt="${escapeHtml(content.brandName)}">
      <h1>${escapeHtml(content.title)}</h1>
      ${content.notice ? `<p class="legal-notice" data-legal-notice="${content.notice.kind}"${content.notice.kind === "sample" ? " data-legal-sample" : ""}>${escapeHtml(content.notice.text)}</p>` : ""}
      ${renderMarkdownToHtml(content.introduction)}
    </header>
    <nav class="legal-contents" aria-label="${escapeHtml(content.contentsLabel)}">
      <h2>${escapeHtml(content.contentsLabel)}</h2>
      <ol>${content.sections.map((section) => `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a></li>`).join("")}</ol>
    </nav>
    ${content.sections.map((section, index) => `<section id="${escapeHtml(section.id)}"><h2>${index + 1}. ${escapeHtml(section.title)}</h2>${renderMarkdownToHtml(section.body)}</section>`).join("")}
    <div class="legal-return-area" data-legal-return-area>${returnLink}</div>
  </main>
  <footer class="legal-site-footer" data-legal-footer>${renderLegalLinks(content.legalLinks, returnTo)}</footer>
</body>
</html>`);
}
