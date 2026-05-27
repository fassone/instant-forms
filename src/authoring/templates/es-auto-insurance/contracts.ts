import { z } from "../../../platform/flow";

export const autoInsuranceAnswersContract = z.object({
  belongs_to_state: z.enum(["yes", "no"]),
  residence_state: z.string().optional(),
  has_license: z.enum(["yes", "no"]),
  has_insurance: z.enum(["yes", "no"]),
  is_clean_title: z.enum(["yes", "no"]),
  number_of_registered_cars: z.enum(["1", "2+"]),
  first_name: z.string(),
  last_name: z.string(),
  phone_number: z.string(),
});

export const autoInsurancePayloadContract = z.object({
  marketState: z.string(),
  marketName: z.string(),
  product: z.string(),
  phone: z.string(),
});

export const autoInsuranceContextContract = z.object({
  areaCode: z.string(),
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
