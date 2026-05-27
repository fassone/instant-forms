import type { FormAttribution } from "../../../platform/flow";

export function createFbclidAttribution(): FormAttribution {
  return {
    preserveQueryParams: ["fbclid"],
    capture: ({ url, now, cookies }) => {
      const fbclid = url.searchParams.get("fbclid")?.trim();

      if (!fbclid || fbclid.length > 500) {
        return;
      }

      const existingClickId = getFbcClickId(cookies.get("_fbc"));
      if (existingClickId === fbclid) {
        return;
      }

      cookies.set("_fbc", `fb.1.${now.getTime()}.${fbclid}`, {
        path: "/",
        maxAge: 90 * 24 * 60 * 60,
        sameSite: "Lax",
        httpOnly: false,
      });
    },
  };
}

export function getFbcClickId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const lastSeparatorIndex = value.lastIndexOf(".");

  return lastSeparatorIndex === -1 ? undefined : value.slice(lastSeparatorIndex + 1);
}
