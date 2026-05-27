import { esAutoInsuranceTemplate } from "../../templates/es-auto-insurance";

export const tnFlow = esAutoInsuranceTemplate.create({
  flowName: "ES - TN - v6",
  pageName: "Seguros Aseguranza",
  submissionUrl: "https://api.liderna.net/webleads/v2",
  areaCode: "TN",
  areaName: "Tennessee",
  product: "auto_insurance",
  advertiserName: "Liderna Inc y a sus socios, agentes y proveedores de seguros",
  gtmContainerId: "GTM-MVJNX5DZ",
  metaPixelId: "1465068051587670",
  metaTestEventCode: process.env.META_TEST_EVENT_CODE,
  metaConversionsAccessToken:
    process.env.NODE_ENV === "test" ? undefined : process.env.META_CONVERSIONS_ACCESS_TOKEN || undefined,
});
