import { createGenericInsuranceTracking } from "../generic-tracking";
import { defineFormFlow, defineFormTemplate } from "../../../platform/flow";
import { createLeadAttribution } from "./attribution";
import { homeInsuranceContract, genericHomeInsuranceContract } from "./contracts";
import { createEsHomeInsurancePageMeta, esHomeInsurancePostSubmit, esUiCopy } from "./copy";
import { createLidernaWebleadsPayloadMapping } from "./payload";
import { createHomeInsuranceSteps, createGenericHomeInsuranceSteps } from "./steps";
import { createHomeInsuranceTracking, safePostHogAnswerKeys } from "./tracking";
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
      trackingSessionIdCookieMaxAgeSeconds: variables.trackingSessionIdCookieMaxAgeSeconds,
    });

    return defineFormFlow<typeof homeInsuranceContract, ReturnType<ReturnType<typeof createHomeInsuranceSteps>>>({
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
        mapping: (input) => createLidernaWebleadsPayloadMapping({
          metaPixelId: variables.metaPixelId,
          metaTestEventCode: variables.metaTestEventCode,
        })(input),
      },
      page: {
        name: variables.pageName,
        meta: createEsHomeInsurancePageMeta(areaDisplayName),
        presentation: {
          desktopHeightPx: 820,
        },
      },
      postSubmit: esHomeInsurancePostSubmit,
      attribution: createLeadAttribution(),
      ...(tracking ? { tracking } : {}),
      steps: createHomeInsuranceSteps({ areaDisplayName }),
    });
  },
});

export const esGenericHomeInsuranceTemplate = defineFormTemplate({
  variables: esHomeInsuranceVariables.omit({ areaCode: true, areaName: true }),
  create: ({ variables }) => {
    const tracking = createGenericInsuranceTracking<typeof genericHomeInsuranceContract>({
      stateAnswerKey: "property_state",
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

    return defineFormFlow<typeof genericHomeInsuranceContract, ReturnType<typeof createGenericHomeInsuranceSteps>>({
      name: variables.flowName,
      status: "ACTIVE",
      locale: "es",
      ui: esUiCopy,
      contract: genericHomeInsuranceContract,
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
        meta: createEsHomeInsurancePageMeta(),
        presentation: {
          desktopHeightPx: 820,
          showAreaBadge: false,
        },
      },
      postSubmit: esHomeInsurancePostSubmit,
      attribution: {
        ...createLeadAttribution(),
        preserveQueryParams: [...(createLeadAttribution().preserveQueryParams ?? []), "state"],
      },
      ...(tracking ? { tracking } : {}),
      steps: createGenericHomeInsuranceSteps,
    });
  },
});
