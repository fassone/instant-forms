import { createGenericInsuranceTracking } from "../generic-tracking";
import { legalLinks } from "../../legal/links";
import { defineFormFlow, defineFormTemplate } from "../../../platform/flow";
import { createLeadAttribution } from "./attribution";
import { autoInsuranceContract, genericAutoInsuranceContract } from "./contracts";
import { createEsAutoInsurancePageMeta, esAutoInsurancePostSubmit, esUiCopy } from "./copy";
import { createLidernaWebleadsPayloadMapping } from "./payload";
import { createAutoInsuranceSteps, createGenericAutoInsuranceSteps } from "./steps";
import { createAutoInsuranceTracking, safePostHogAnswerKeys } from "./tracking";
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
      postHogProjectApiKey: variables.postHogProjectApiKey,
      postHogApiHost: variables.postHogApiHost,
      trackingVisitorIdCookieMaxAgeSeconds: variables.trackingVisitorIdCookieMaxAgeSeconds,
      trackingSessionIdCookieMaxAgeSeconds: variables.trackingSessionIdCookieMaxAgeSeconds,
    });

    return defineFormFlow<typeof autoInsuranceContract, ReturnType<ReturnType<typeof createAutoInsuranceSteps>>>({
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
        url: variables.submissionUrl,
        method: "POST",
        encoding: "json",
        mapping: (input) => createLidernaWebleadsPayloadMapping({
          metaPixelId: variables.metaPixelId,
          metaTestEventCode: variables.metaTestEventCode,
        })(input),
      },
      page: {
        name: variables.pageName,
        meta: createEsAutoInsurancePageMeta(areaDisplayName),
        legalLinks,
        presentation: {
          desktopHeightPx: 820,
        },
      },
      postSubmit: esAutoInsurancePostSubmit,
      attribution: createLeadAttribution(),
      ...(tracking ? { tracking } : {}),
      steps: createAutoInsuranceSteps({ areaDisplayName }),
    });
  },
});

export const esGenericAutoInsuranceTemplate = defineFormTemplate({
  variables: esAutoInsuranceVariables.omit({ areaCode: true, areaName: true }),
  create: ({ variables }) => {
    const tracking = createGenericInsuranceTracking<typeof genericAutoInsuranceContract>({
      stateAnswerKey: "residence_state",
      safeAnswerKeys: safePostHogAnswerKeys,
      includeContext: ["product"],
      gtmContainerId: variables.gtmContainerId,
      metaPixelId: variables.metaPixelId,
      metaTestEventCode: variables.metaTestEventCode,
      metaConversionsAccessToken: variables.metaConversionsAccessToken,
      postHogProjectApiKey: variables.postHogProjectApiKey,
      postHogApiHost: variables.postHogApiHost,
      trackingVisitorIdCookieMaxAgeSeconds: variables.trackingVisitorIdCookieMaxAgeSeconds,
      trackingSessionIdCookieMaxAgeSeconds: variables.trackingSessionIdCookieMaxAgeSeconds,
    });

    return defineFormFlow<typeof genericAutoInsuranceContract, ReturnType<typeof createGenericAutoInsuranceSteps>>({
      name: variables.flowName,
      status: "ACTIVE",
      locale: "es",
      ui: esUiCopy,
      contract: genericAutoInsuranceContract,
      context: {
        product: variables.product,
        advertiserName: variables.advertiserName,
      },
      payload: {
        url: variables.submissionUrl,
        method: "POST",
        encoding: "json",
        mapping: (input) => createLidernaWebleadsPayloadMapping({
          metaPixelId: variables.metaPixelId,
          metaTestEventCode: variables.metaTestEventCode,
        })(input),
      },
      page: {
        name: variables.pageName,
        meta: createEsAutoInsurancePageMeta(),
        legalLinks,
        presentation: {
          desktopHeightPx: 820,
          showAreaBadge: false,
        },
      },
      postSubmit: esAutoInsurancePostSubmit,
      attribution: {
        ...createLeadAttribution(),
        preserveQueryParams: [...(createLeadAttribution().preserveQueryParams ?? []), "state"],
      },
      ...(tracking ? { tracking } : {}),
      steps: createGenericAutoInsuranceSteps,
    });
  },
});
