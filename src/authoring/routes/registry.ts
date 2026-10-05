import { defineFormRoutes, unavailable, type FormRouteAction } from "../../platform/routing";
import type { QuoteEntryPage } from "../../platform/rendering/quote-entry-page";
import { autoFlows } from "../flows/auto/registry";
import { homeFlows } from "../flows/home/registry";
import { genericAutoFlow, genericHomeFlow } from "../flows/generic";

const notFound = unavailable({
  locale: "es",
  status: 404,
  title: "404",
  message: "Esta página no existe o ya no está disponible.",
});

const quoteEntry: QuoteEntryPage = {
  locale: "es",
  pageName: "Seguros Aseguranza",
  desktopHeightPx: 820,
  title: "Seguro claro, rápido y en español",
  body: "Hemos ayudado a miles de familias latinas a comparar opciones de seguro accesibles, claras y sin compromiso.",
  benefits: ["Atención en español", "Seguro de auto y hogar", "Cotización rápida y sencilla"],
  ctaLabel: "Empezar mi cotización",
  selectionPath: "/cotizar/producto",
  productTitle: "¿Qué desea asegurar?",
  continueLabel: "Continuar",
  products: [
    { key: "auto", label: "Seguro de auto", routeKey: "auto" },
    { key: "hogar", label: "Seguro de hogar", routeKey: "hogar" },
  ],
};

const welcome = { type: "quote_entry", content: quoteEntry, selection: false } as const satisfies FormRouteAction;

export const formRoutes = defineFormRoutes({
  index: welcome,
  folders: {
    cotizar: {
      index: welcome,
      producto: { type: "quote_entry", content: quoteEntry, selection: true },
    },
    auto: {
      index: genericAutoFlow,
      queryPrefill: { state: "residence_state" },
      ...autoFlows,
      notFound: { type: "generic_state", to: "/auto/inicio", unavailable: notFound },
    },
    hogar: {
      index: genericHomeFlow,
      queryPrefill: { state: "property_state" },
      ...homeFlows,
      notFound: { type: "generic_state", to: "/hogar/inicio", unavailable: notFound },
    },
  },
  notFound,
});
