import type { TrustedFormConsentInlineTagRole } from "./types";

const trustedFormTagPrefix = "\uE100TF:";
const trustedFormTagSuffix = ":\uE101";

export type TrustedFormConsentMarkdownPart =
  | { kind: "text"; value: string }
  | { kind: "trusted_form_tag"; role: TrustedFormConsentInlineTagRole; value: string };

export function encodeTrustedFormConsentTag(role: TrustedFormConsentInlineTagRole, value: string): string {
  return `${trustedFormTagPrefix}${encodeURIComponent(JSON.stringify({ role, value }))}${trustedFormTagSuffix}`;
}

export function parseTrustedFormConsentMarkdown(value: string): TrustedFormConsentMarkdownPart[] {
  const parts: TrustedFormConsentMarkdownPart[] = [];
  let cursor = 0;
  const tokenPattern = new RegExp(`${trustedFormTagPrefix}([\\s\\S]*?)${trustedFormTagSuffix}`, "g");

  for (const match of value.matchAll(tokenPattern)) {
    const tokenStart = match.index ?? 0;
    if (tokenStart > cursor) {
      parts.push({ kind: "text", value: value.slice(cursor, tokenStart) });
    }

    const encodedTag = match[1] ?? "";
    const parsedTag = parseTrustedFormConsentTag(encodedTag);
    if (parsedTag) {
      parts.push(parsedTag);
    } else {
      parts.push({ kind: "text", value: match[0] });
    }
    cursor = tokenStart + match[0].length;
  }

  if (cursor < value.length) {
    parts.push({ kind: "text", value: value.slice(cursor) });
  }

  return parts;
}

function parseTrustedFormConsentTag(encodedTag: string): TrustedFormConsentMarkdownPart | undefined {
  try {
    const parsedTag = JSON.parse(decodeURIComponent(encodedTag)) as unknown;
    if (
      parsedTag &&
      typeof parsedTag === "object" &&
      "role" in parsedTag &&
      "value" in parsedTag &&
      isTrustedFormConsentInlineTagRole(parsedTag.role) &&
      typeof parsedTag.value === "string"
    ) {
      return {
        kind: "trusted_form_tag",
        role: parsedTag.role,
        value: parsedTag.value,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isTrustedFormConsentInlineTagRole(value: unknown): value is TrustedFormConsentInlineTagRole {
  return (
    value === "submit-text" ||
    value === "consent-advertiser-name" ||
    value === "contact-method" ||
    value === "consent-grantor-name" ||
    value === "consent-grantor-phone" ||
    value === "consent-grantor-email" ||
    value === "consent-grantor-address" ||
    value === "consent-grantor-waived-dnc" ||
    value === "consent-grantor-waived-purchase-condition" ||
    value === "consent-grantor-waived-regulated-technologies"
  );
}
