import type { FormPayloadDelivery, MetaPixelId } from "../../../platform/flow";
import { getCapturedLeadAttribution } from "./attribution";
import type { AutoInsuranceContract } from "./contracts";

type CreateLidernaWebleadsPayloadMappingInput = {
  metaPixelId?: MetaPixelId;
  metaTestEventCode?: string;
};

export function createLidernaWebleadsPayloadMapping({
  metaPixelId,
  metaTestEventCode,
}: CreateLidernaWebleadsPayloadMappingInput): FormPayloadDelivery<AutoInsuranceContract>["mapping"] {
  return ({ context, answers, submission, cookies, request, browser }) => {
    const attribution = getCapturedLeadAttribution(cookies);

    return {
      id: submission.id,
      area: answers.residence_state ?? context.areaCode,
      source_channel: attribution.sourceChannel,
      acquisition_channel: attribution.acquisitionChannel,
      ingress_channel: "website",
      first_name: answers.first_name,
      type: "insurance_auto",
      last_name: answers.last_name,
      phone_number: answers.phone_number,
      created_time: submission.submittedAt,
      ...("platform" in attribution ? { platform: attribution.platform } : {}),
      state_code: answers.residence_state ?? context.areaCode,
      is_clean_title: answers.is_clean_title,
      has_license: answers.has_license,
      has_insurance: answers.has_insurance,
      number_of_registered_cars: answers.number_of_registered_cars,
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
