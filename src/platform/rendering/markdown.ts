const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

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
  const normalizedValue = value.replace(/\r\n?/g, "\n").trim();
  if (!normalizedValue) {
    return "";
  }

  return normalizedValue
    .split(/\n{2,}/)
    .map((block) => renderMarkdownBlock(block.trim()))
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

function renderMarkdownBlock(block: string): string {
  const lines = block.split("\n");
  if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
    return `<ul>${lines.map((line) => `<li>${renderInlineMarkdown(line.trim().replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
  }

  return `<p>${lines.map(renderInlineMarkdown).join("<br>")}</p>`;
}

function renderInlineMarkdown(value: string): string {
  const withoutImages = value.replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, "$1");
  const escaped = escapeHtml(withoutImages);

  return escaped
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
