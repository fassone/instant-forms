import type { Hono } from "hono";

import { getFormByAreaCode, type InstantForm } from "../../flows";
import { renderFormPage, renderUnavailablePage } from "../../rendering";
import { htmlResponse } from "../http/responses";

export function registerPreviewRoutes(app: Hono): void {
  app.get("/__preview/:areaCode/buscando-oferta", (c) => {
    const areaCode = c.req.param("areaCode");
    const form = getFormByAreaCode(areaCode);

    if (!form) {
      return htmlResponse(renderUnavailablePage(areaCode), 404);
    }

    const previewForm = getMatchingPreviewForm(form);

    if (!previewForm) {
      return htmlResponse(renderUnavailablePage(areaCode), 404);
    }

    const previewPath = `/__preview/${form.areaCode}/buscando-oferta`;

    return htmlResponse(
      renderFormPage(previewForm, {
        activeStepIndex: 0,
        answers: {},
        previewMode: true,
        stepUrlOverrides: {
          matching_offer: previewPath,
        },
      }),
      200,
      "no-store",
    );
  });
}

function getMatchingPreviewForm(form: InstantForm): InstantForm | undefined {
  const matchingStep = form.steps.find(
    (stepDefinition) => stepDefinition.kind === "interstitial" && stepDefinition.key === "matching_offer",
  );

  if (!matchingStep) {
    return undefined;
  }

  return {
    ...form,
    steps: [matchingStep],
  };
}
