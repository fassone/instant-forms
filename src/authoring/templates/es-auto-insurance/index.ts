import { defineFormFlow, defineFormTemplate } from "../../../platform/flow";
import { createFbclidAttribution } from "./attribution";
import { autoInsuranceContract } from "./contracts";
import { esAutoInsurancePostSubmit, esUiCopy } from "./copy";
import { createAutoInsuranceSteps } from "./steps";
import { createAutoInsuranceTracking } from "./tracking";
import { esAutoInsuranceVariables } from "./variables";

export { esAutoInsuranceVariables } from "./variables";

export const esAutoInsuranceTemplate = defineFormTemplate({
  variables: esAutoInsuranceVariables,
  create: ({ variables }) => {
    const areaDisplayName = variables.areaName ?? variables.areaCode;
    const tracking = createAutoInsuranceTracking({
      gtmContainerId: variables.gtmContainerId,
      metaPixelId: variables.metaPixelId,
      metaTestEventCode: variables.metaTestEventCode,
      metaConversionsAccessToken: variables.metaConversionsAccessToken,
    });

    return defineFormFlow({
      name: variables.flowName,
      status: "ACTIVE",
      locale: "es",
      ui: esUiCopy,
      contract: autoInsuranceContract,
      context: {
        areaCode: variables.areaCode,
        areaName: variables.areaName,
        product: variables.product,
        advertiserName: variables.advertiserName,
      },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ context, answers }) => ({
          marketState: context.areaCode,
          marketName: context.areaName ?? context.areaCode,
          product: context.product,
          phone: answers.phone_number,
        }),
      },
      page: {
        name: variables.pageName,
      },
      postSubmit: esAutoInsurancePostSubmit,
      attribution: createFbclidAttribution(),
      ...(tracking ? { tracking } : {}),
      steps: createAutoInsuranceSteps({ areaDisplayName }),
    });
  },
});
