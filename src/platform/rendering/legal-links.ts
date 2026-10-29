import type { FormLegalLink } from "../flow";

export const LEGAL_RETURN_QUERY_KEYS = ["fbclid", "source_channel", "acquisition_channel", "platform", "state"] as const;

// Keep return URLs local and exclude unrelated query values, including form data.
export function getLegalReturnPath(value: string, origin = "https://forms.invalid"): string {
  try {
    if (/[\\\u0000-\u0020\u007f]/u.test(value) || value.startsWith("//")) return "/";
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password) return "/";
    const query = new URLSearchParams();
    for (const key of LEGAL_RETURN_QUERY_KEYS) {
      const entry = url.searchParams.get(key);
      if (entry) query.set(key, entry);
    }
    return (url.pathname.replace(/\/+$/u, "") || "/") + (query.size ? "?" + query : "");
  } catch {
    return "/";
  }
}

export function renderLegalLinks(links: readonly FormLegalLink[] | undefined, returnTo: string): string {
  if (!links?.length) return "";
  const query = new URLSearchParams({ returnTo: getLegalReturnPath(returnTo) });
  return `<nav class="legal-links" data-legal-links aria-label="${escapeHtml(links.map((link) => link.label).join(", "))}">${links.map((link) =>
    `<a href="${escapeHtml(link.href + "?" + query)}" data-legal-document="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
  ).join("")}</nav>`;
}

export function renderLegalLinkScript(): string {
  return `<script>
(() => {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[data-legal-document]");
    if (!(link instanceof HTMLAnchorElement)) return;
    const current = new URL(window.location.href);
    const query = new URLSearchParams();
    for (const key of ${JSON.stringify(LEGAL_RETURN_QUERY_KEYS)}) {
      const value = current.searchParams.get(key);
      if (value) query.set(key, value);
    }
    const destination = new URL(link.dataset.legalDocument, window.location.origin);
    destination.searchParams.set("returnTo", current.pathname + (query.size ? "?" + query : ""));
    link.href = destination.pathname + destination.search;
  });
})();
</script>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}
