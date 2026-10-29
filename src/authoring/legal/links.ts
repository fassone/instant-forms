import type { FormLegalLink } from "../../platform/flow";

export const legalLinks = [
  { label: "Política de privacidad", href: "/politica-de-privacidad" },
  { label: "Términos y condiciones", href: "/terminos-y-condiciones" },
] as const satisfies readonly FormLegalLink[];
