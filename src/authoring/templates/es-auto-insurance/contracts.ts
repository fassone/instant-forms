import { z } from "../../../platform/flow";
import { US_STATES } from "../../../shared/data/us-states";

const lidernaAreaCodes = US_STATES.map((state) => state.code) as [
  (typeof US_STATES)[number]["code"],
  ...(typeof US_STATES)[number]["code"][],
];

export const lidernaAreaCodeSchema = z.enum(lidernaAreaCodes);

export const autoInsuranceAnswersContract = z.object({
  belongs_to_state: z.enum(["yes", "no"]),
  residence_state: lidernaAreaCodeSchema.optional(),
  has_license: z.enum(["yes", "no"]),
  has_insurance: z.enum(["yes", "no"]),
  is_clean_title: z.enum(["yes", "no"]),
  number_of_registered_cars: z.enum(["1", "2+"]),
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

export const autoInsurancePayloadContract = z.object({
  id: z.string(),
  area: lidernaAreaCodeSchema,
  source_channel: z.string(),
  acquisition_channel: lidernaAcquisitionChannelSchema,
  ingress_channel: z.literal("website"),
  first_name: z.string(),
  type: z.literal("insurance_auto"),
  last_name: z.string().optional(),
  email: z.string().optional(),
  phone_number: z.string().optional(),
  created_time: z.string().optional(),
  platform: z.string().optional(),
  state_code: z.string().optional(),
  zip_code: z.string().optional(),
  is_clean_title: z.enum(["yes", "no", "n/a"]).optional(),
  has_license: z.enum(["yes", "no"]).optional(),
  has_insurance: z.enum(["yes", "no"]).optional(),
  number_of_registered_cars: z.enum(["0", "1", "2+"]).optional(),
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
});

export const autoInsuranceContextContract = z.object({
  areaCode: lidernaAreaCodeSchema,
  areaName: z.string().optional(),
  product: z.string(),
  advertiserName: z.string(),
});

export const autoInsuranceContract = {
  context: autoInsuranceContextContract,
  answers: autoInsuranceAnswersContract,
  payload: autoInsurancePayloadContract,
} as const;

export type AutoInsuranceContract = typeof autoInsuranceContract;
