import type { FormPayloadDelivery, MetaPixelId } from "../../../platform/flow";
import { getCapturedLeadAttribution } from "./attribution";
import type { HomeInsuranceContract } from "./contracts";

type CreateLidernaWebleadsPayloadMappingInput = {
  metaPixelId?: MetaPixelId;
  metaTestEventCode?: string;
};

export function createLidernaWebleadsPayloadMapping({
  metaPixelId,
  metaTestEventCode,
}: CreateLidernaWebleadsPayloadMappingInput): FormPayloadDelivery<HomeInsuranceContract>["mapping"] {
  return ({ context, answers, submission, cookies, request, browser }) => {
    const attribution = getCapturedLeadAttribution(cookies);
    const propertyState = answers.property_state ?? context.areaCode;

    return {
      id: submission.id,
      area: propertyState,
      source_channel: attribution.sourceChannel,
      acquisition_channel: attribution.acquisitionChannel,
      ingress_channel: "website",
      first_name: answers.first_name,
      type: "insurance_home",
      last_name: answers.last_name,
      phone_number: answers.phone_number,
      created_time: submission.submittedAt,
      ...("platform" in attribution ? { platform: attribution.platform } : {}),
      state_code: propertyState,
      ownership_status: answers.ownership_status,
      property_type: answers.property_type,
      property_use: answers.property_use,
      has_home_insurance: answers.has_home_insurance,
      house_age_years: answers.house_age_years,
      roof_age_years: answers.roof_age_years,
      consent: answers.trustedform_consent.consent,
      ...(answers.trustedform_consent.trustedform_certificate_url
        ? { trustedform_certificate_url: answers.trustedform_consent.trustedform_certificate_url }
        : {}),
      ...(metaTestEventCode
        ? {
            _mock_verification: {
              searchbug: true,
            },
            _mock_dispatch: {
              googleSheets: true,
              leadManager: true,
              ricochet: true,
            },
          }
        : {}),
      meta_conversion: metaPixelId
        ? {
            enabled: true,
            pixel_id: metaPixelId,
            event_source_url: browser.eventSourceUrl ?? request.url,
            event_id: submission.id,
            event_name: "Lead",
            client_ip_address: request.ip,
            client_user_agent: request.userAgent,
            fbp: browser.fbp ?? cookies.get("_fbp"),
            fbc: browser.fbc ?? cookies.get("_fbc"),
            test_event_code: metaTestEventCode,
          }
        : {
            enabled: false,
          },
    };
  };
}
