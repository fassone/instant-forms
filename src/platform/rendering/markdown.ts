import { parseTrustedFormConsentMarkdown, type TrustedFormConsentMarkdownPart } from "../flow/dsl/consent-markdown";

const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const trustedFormTagPlaceholderPrefix = "\uE200TF_TAG_";
const trustedFormTagPlaceholderSuffix = "_\uE201";

export type RenderedMarkdown = {
  text: string;
  html: string;
};

export function renderMarkdown(value: string): RenderedMarkdown {
  const normalizedValue = value.replace(/\r\n?/g, "\n").trim();
  return {
    text: renderMarkdownToText(normalizedValue),
    html: renderMarkdownToHtml(normalizedValue),
  };
}

export function renderMarkdownToHtml(value: string): string {
  return renderMarkdownToHtmlWithOptions(value, { trustedFormTags: false });
}

export function renderConsentMarkdown(value: string): RenderedMarkdown {
  const normalizedValue = value.replace(/\r\n?/g, "\n").trim();
  return {
    text: renderConsentMarkdownToText(normalizedValue),
    html: renderConsentMarkdownToHtml(normalizedValue),
  };
}

export function renderConsentMarkdownToHtml(value: string): string {
  return renderMarkdownToHtmlWithOptions(value, { trustedFormTags: true });
}

function renderMarkdownToHtmlWithOptions(value: string, options: { trustedFormTags: boolean }): string {
  const normalizedValue = value.replace(/\r\n?/g, "\n").trim();
  if (!normalizedValue) {
    return "";
  }

  return normalizedValue
    .split(/\n{2,}/)
    .map((block) => renderMarkdownBlock(block.trim(), options))
    .join("");
}

export function renderMarkdownToText(value: string): string {
  return value
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(linkPattern, "$1")
    .replace(/([*_`])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderConsentMarkdownToText(value: string): string {
  return renderMarkdownToText(
    parseTrustedFormConsentMarkdown(value)
      .map((part) => (part.kind === "trusted_form_tag" ? part.value : part.value))
      .join(""),
  );
}

function renderMarkdownBlock(block: string, options: { trustedFormTags: boolean }): string {
  const lines = block.split("\n");
  if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
    return `<ul>${lines.map((line) => `<li>${renderInlineMarkdown(line.trim().replace(/^[-*]\s+/, ""), options)}</li>`).join("")}</ul>`;
  }

  return `<p>${lines.map((line) => renderInlineMarkdown(line, options)).join("<br>")}</p>`;
}

function renderInlineMarkdown(value: string, options: { trustedFormTags: boolean }): string {
  const withoutImages = value.replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, "$1");
  const trustedFormTags: TrustedFormConsentMarkdownPart[] = [];
  const escaped = options.trustedFormTags
    ? parseTrustedFormConsentMarkdown(withoutImages)
        .map((part) => {
          if (part.kind === "text") {
            return escapeHtml(part.value);
          }

          const placeholder = `${trustedFormTagPlaceholderPrefix}${trustedFormTags.length}${trustedFormTagPlaceholderSuffix}`;
          trustedFormTags.push(part);
          return placeholder;
        })
        .join("")
    : escapeHtml(withoutImages);

  const renderedHtml = escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(linkPattern, (_match, label: string, href: string) => {
      const safeHref = getSafeHref(unescapeHtmlAttribute(href));
      if (!safeHref) {
        return label;
      }

      return `<a href="${escapeHtml(safeHref)}" rel="nofollow noopener noreferrer" target="_blank">${label}</a>`;
    });

  if (!options.trustedFormTags || trustedFormTags.length === 0) {
    return renderedHtml;
  }

  return renderedHtml.replace(
    new RegExp(`${trustedFormTagPlaceholderPrefix}(\\d+)${trustedFormTagPlaceholderSuffix}`, "g"),
    (_match, index: string) => {
      const trustedFormTag = trustedFormTags[Number(index)];
      if (!trustedFormTag || trustedFormTag.kind !== "trusted_form_tag") {
        return "";
      }

      return `<span data-tf-element-role="${escapeHtml(trustedFormTag.role)}">${escapeHtml(trustedFormTag.value)}</span>`;
    },
  );
}

function getSafeHref(value: string): string | undefined {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("/")) {
    return trimmedValue;
  }

  try {
    const url = new URL(trimmedValue);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function unescapeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
