import { defineFormFlow, defineFormTemplate } from "../../../platform/flow";
import { createLeadAttribution } from "./attribution";
import { homeInsuranceContract } from "./contracts";
import { createEsHomeInsurancePageMeta, esHomeInsurancePostSubmit, esUiCopy } from "./copy";
import { createLidernaWebleadsPayloadMapping } from "./payload";
import { createHomeInsuranceSteps } from "./steps";
import { createHomeInsuranceTracking } from "./tracking";
import { esHomeInsuranceVariables } from "./variables";

export { esHomeInsuranceVariables } from "./variables";

export const esHomeInsuranceTemplate = defineFormTemplate({
  variables: esHomeInsuranceVariables,
  create: ({ variables }) => {
    const areaDisplayName = variables.areaName ?? variables.areaCode;
    const tracking = createHomeInsuranceTracking({
      gtmContainerId: variables.gtmContainerId,
      metaPixelId: variables.metaPixelId,
      metaTestEventCode: variables.metaTestEventCode,
      metaConversionsAccessToken: variables.metaConversionsAccessToken,
      postHogProjectApiKey: variables.postHogProjectApiKey,
      postHogApiHost: variables.postHogApiHost,
      trackingVisitorIdCookieMaxAgeSeconds: variables.trackingVisitorIdCookieMaxAgeSeconds,
    });

    return defineFormFlow({
      name: variables.flowName,
      status: "ACTIVE",
      locale: "es",
      ui: esUiCopy,
      contract: homeInsuranceContract,
      context: {
        areaCode: variables.areaCode,
        areaName: variables.areaName,
        product: variables.product,
        advertiserName: variables.advertiserName,
      },
      payload: {
        url: variables.submissionUrl,
        method: "POST",
        encoding: "json",
        mapping: createLidernaWebleadsPayloadMapping({
          metaPixelId: variables.metaPixelId,
          metaTestEventCode: variables.metaTestEventCode,
        }),
      },
      page: {
        name: variables.pageName,
        meta: createEsHomeInsurancePageMeta(areaDisplayName),
      },
      postSubmit: esHomeInsurancePostSubmit,
      attribution: createLeadAttribution(),
      ...(tracking ? { tracking } : {}),
      steps: createHomeInsuranceSteps({ areaDisplayName }),
    });
  },
});
