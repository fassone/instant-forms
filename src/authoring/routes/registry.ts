import { defineFormRoutes, redirectTo, unavailable } from "../../platform/routing";
import { tnFlow } from "../flows/tn/flow";

export const formRoutes = defineFormRoutes({
  index: redirectTo("/tn"),

  folders: {
    tn: {
      custom: tnFlow,
      notFound: redirectTo("/tn/custom"),
    },
  },

  notFound: unavailable({
    status: 404,
    title: "404",
    message: "Esta página no existe o ya no está disponible.",
    cta: {
      label: "Ir al formulario",
      href: "/tn/custom",
    },
  }),
});
