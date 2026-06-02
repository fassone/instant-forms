import { z } from "../../../platform/flow";
import { US_STATES } from "../../../shared/data/us-states";

const lidernaAreaCodes = US_STATES.map((state) => state.code) as [
  (typeof US_STATES)[number]["code"],
  ...(typeof US_STATES)[number]["code"][],
];

export const lidernaAreaCodeSchema = z.enum(lidernaAreaCodes);

export const homeInsuranceAnswersContract = z.object({
  property_in_state: z.enum(["yes", "no"]),
  property_state: lidernaAreaCodeSchema.optional(),
  ownership_status: z.enum(["own", "rent"]),
  property_type: z.enum(["single_family", "condo", "townhouse", "mobile_home", "multi_family", "other"]),
  property_use: z.enum(["primary_residence", "secondary_home", "rental_property", "vacant"]),
  has_home_insurance: z.enum(["yes", "no"]),
  house_age_years: z.enum(["0_5", "6_10", "11_20", "21_plus"]),
  roof_age_years: z.enum(["0_5", "6_10", "11_20", "21_plus"]),
  first_name: z.string(),
  last_name: z.string(),
  phone_number: z.string(),
  trustedform_consent: z.object({
    consent: z.string().min(1),
    trustedform_certificate_url: z.string().nullable(),
  }),
});

export const lidernaAcquisitionChannelSchema = z.enum(["paid", "organic"]);

export const metaConversionPayloadContract = z.union([
  z.object({
    enabled: z.literal(false),
  }),
  z.object({
    enabled: z.literal(true),
    pixel_id: z.string(),
    event_source_url: z.string(),
    event_id: z.string().optional(),
    event_name: z.literal("Lead").optional(),
    client_ip_address: z.string().optional(),
    client_user_agent: z.string().optional(),
    fbp: z.string().optional(),
    fbc: z.string().optional(),
    test_event_code: z.string().optional(),
  }),
]);

export const homeInsurancePayloadContract = z
  .object({
    id: z.string(),
    area: lidernaAreaCodeSchema,
    source_channel: z.string(),
    acquisition_channel: lidernaAcquisitionChannelSchema,
    ingress_channel: z.literal("website"),
    first_name: z.string(),
    type: z.literal("insurance_home"),
    last_name: z.string().optional(),
    email: z.string().optional(),
    phone_number: z.string().optional(),
    created_time: z.string().optional(),
    platform: z.string().optional(),
    state_code: lidernaAreaCodeSchema.optional(),
    zip_code: z.string().optional(),
    ownership_status: z.enum(["own", "rent"]).optional(),
    property_type: z
      .enum(["single_family", "condo", "townhouse", "mobile_home", "multi_family", "other"])
      .optional(),
    property_use: z.enum(["primary_residence", "secondary_home", "rental_property", "vacant"]).optional(),
    has_home_insurance: z.enum(["yes", "no"]).optional(),
    house_age_years: z.enum(["0_5", "6_10", "11_20", "21_plus"]).optional(),
    roof_age_years: z.enum(["0_5", "6_10", "11_20", "21_plus"]).optional(),
    consent: z.string().min(1),
    trustedform_certificate_url: z.string().optional(),
    _mock_verification: z
      .object({
        searchbug: z.literal(true),
      })
      .optional(),
    _mock_dispatch: z
      .object({
        googleSheets: z.literal(true),
        leadManager: z.literal(true),
        ricochet: z.literal(true),
      })
      .optional(),
    meta_conversion: metaConversionPayloadContract.optional(),
  })
  .refine((payload) => Boolean(payload.email || payload.phone_number), {
    path: ["phone_number"],
    message: "At least one of email or phone_number is required.",
  });

export const homeInsuranceContextContract = z.object({
  areaCode: lidernaAreaCodeSchema,
  areaName: z.string().optional(),
  product: z.string(),
  advertiserName: z.string(),
});

export const homeInsuranceContract = {
  context: homeInsuranceContextContract,
  answers: homeInsuranceAnswersContract,
  payload: homeInsurancePayloadContract,
} as const;

export type HomeInsuranceContract = typeof homeInsuranceContract;
