import { defineFormRoutes, redirectTo, unavailable } from "../../platform/routing";
import { autoFlows } from "../flows/auto/registry";
import { homeFlows } from "../flows/home/registry";

export const formRoutes = defineFormRoutes({
  index: redirectTo("/auto/tn"),

  folders: {
    auto: {
      ...autoFlows,
      // notFound: redirectTo("/auto/tn"),
    },
    hogar: {
      ...homeFlows,
      // notFound: redirectTo("/home/tn"),
    },
  },

  notFound: unavailable({
    locale: "es",
    status: 404,
    title: "404",
    message: "Esta página no existe o ya no está disponible.",
    /*cta: {
      label: "Ir al formulario",
      href: "/auto/tn",
    },*/
  }),
});
