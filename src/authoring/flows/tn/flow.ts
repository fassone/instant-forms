import { defineFormFlow } from "../../../platform/flow/dsl/define-form-flow";
import { autocompleteSource } from "../../../platform/flow/dsl/step-builders";
import { z } from "../../../platform/flow";

export const tnFlow = defineFormFlow({
  name: "ES - TN - v6",
  status: "ACTIVE",
  contract: {
    context: z.object({
      areaCode: z.string(),
      areaName: z.string().optional(),
      product: z.string(),
    }),
    answers: z.object({
      belongs_to_state: z.enum(["yes", "no"]),
      residence_state: z.string().optional(),
      has_license: z.enum(["yes", "no"]),
      has_insurance: z.enum(["yes", "no"]),
      is_clean_title: z.enum(["yes", "no"]),
      number_of_registered_cars: z.enum(["1", "2+"]),
      first_name: z.string(),
      last_name: z.string(),
      phone_number: z.string(),
    }),
    payload: z.object({
      marketState: z.string(),
      marketName: z.string(),
      product: z.string(),
      phone: z.string(),
    }),
  },
  context: {
    areaCode: "TN",
    areaName: "Tennessee",
    product: "auto_insurance",
  },
  payload: {
    method: "POST",
    encoding: "json",
    mapping: ({ context, answers }) => ({
      marketState: context.areaCode,
      marketName: context.areaName ?? context.product,
      product: context.product,
      phone: answers.phone_number,
    }),
  },
  page: {
    name: "Seguros Aseguranza",
  },
  steps: ({ step, resolve, text }) => [
    step.choice({
      key: "belongs_to_state",
      slug: "vive-en-tennessee",
      label: "¿Usted vive en Tennessee?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.autocomplete({
      key: "residence_state",
      slug: "estado-donde-vive",
      label: "¿En qué estado vive?",
      autocomplete: "address-level1",
      source: autocompleteSource.usStates(),
      showWhen: {
        questionKey: "belongs_to_state",
        answer: "no",
      },
    }),
    step.choice({
      key: "has_license",
      slug: "tiene-licencia",
      label: "¿Usted tiene licencia de los Estado Unidos?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.choice({
      key: "has_insurance",
      slug: "tiene-seguro",
      label: "¿Usted tiene seguro de los Estado Unidos?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.choice({
      key: "is_clean_title",
      slug: "titulo-limpio",
      label: "¿Su auto tiene título limpio?",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.choice({
      key: "number_of_registered_cars",
      slug: "autos-a-asegurar",
      label: "¿Cuantos autos quiere asegurar?",
      options: [
        { key: "1", label: "1" },
        { key: "2+", label: "2+" },
      ],
    }),
    step.interstitial({
      key: "matching_offer",
      slug: "buscando-oferta",
      label: "Estamos buscando su seguro ideal",
      countsAsStep: false,
      benefits: resolve([], ({ context }) => [
        text("Revisando sus respuestas"),
        text("Buscando agentes disponibles"),
        text("Priorizando atención en español"),
        text("Preparando opciones en ", context.areaName ?? context.areaCode),
      ]),
      successLines: [
        { text: "Encontramos agentes listos para cotizarle.", color: "brand-navy" },
        { text: "Descubra cuánto puede ahorrar.", color: "accent" },
      ],
    }),
    step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      type: "FIRST_NAME",
      autocomplete: "given-name",
    }),
    step.text({
      key: "last_name",
      slug: "apellido",
      label: "Apellido",
      type: "LAST_NAME",
      autocomplete: "family-name",
    }),
    step.phone({
      key: "phone_number",
      slug: "telefono",
      label: "Número de teléfono",
    }),
    step.trustedFormConsent({
      key: "trustedform_consent",
      slug: "consentimiento",
      label: "Antes de enviar",
      // Replace with approved consent language before production traffic.
      disclosure:
        "Al seleccionar esta casilla, autorizo a Seguros Aseguranza y a sus agentes a contactarme por teléfono o mensaje de texto sobre opciones de seguro de auto.",
      checkboxLabel: "Acepto continuar y enviar mi solicitud.",
      submitLabel: "Enviar",
      grantorSummary: resolve(["first_name", "last_name", "phone_number", "residence_state"], ({ context, answers }) => ({
        name: text(answers.first_name, " ", answers.last_name, " ", answers.residence_state ?? context.areaCode),
        phone: text(answers.phone_number),
      })),
      trustedForm: {
        fieldName: "xxTrustedFormCertUrl",
        delivery: "main_thread",
        scriptProxyKey: "tfc",
        scriptBaseUrl: "/_instant/scripts/trustedform.com/tfc.js",
        preloadOnPreviousStep: true,
        allowSubmitWithoutCert: true,
      },
    }),
  ],
});
