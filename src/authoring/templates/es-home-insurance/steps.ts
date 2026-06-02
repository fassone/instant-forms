import { autocompleteSource } from "../../../platform/flow";
import type { FlowAuthoringHelpers } from "../../../platform/flow/dsl/step-builders";
import { trustedFormCertify } from "../../integrations/trusted-form";
import type { HomeInsuranceContract } from "./contracts";
import { slugifyTemplateValue } from "./formatting";

type CreateHomeInsuranceStepsInput = {
  areaDisplayName: string;
};

const propertyTypeLabels = {
  single_family: "Casa unifamiliar",
  condo: "Condominio",
  townhouse: "Townhouse",
  mobile_home: "Casa móvil",
  multi_family: "Multifamiliar",
  other: "Otro",
} as const;

const propertyUseLabels = {
  primary_residence: "Residencia principal",
  secondary_home: "Segunda vivienda",
  rental_property: "Propiedad de renta",
  vacant: "Vacante",
} as const;

const ageRangeLabels = {
  "0_5": "0 a 5 años",
  "6_10": "6 a 10 años",
  "11_20": "11 a 20 años",
  "21_plus": "21 años o más",
} as const;

export function createHomeInsuranceSteps({ areaDisplayName }: CreateHomeInsuranceStepsInput) {
  return ({
    step,
    text,
    md,
    phoneDisplay,
    stateDisplay,
    consentMd,
    tfTag,
  }: FlowAuthoringHelpers<HomeInsuranceContract>) =>
    [
      step.choice({
        key: "property_in_state",
        slug: `propiedad-en-${slugifyTemplateValue(areaDisplayName)}`,
        label: `¿La propiedad que quiere asegurar está en ${areaDisplayName}?`,
        options: [
          { key: "yes", label: "Si" },
          { key: "no", label: "No" },
        ],
      }),
      step.autocomplete({
        key: "property_state",
        slug: "estado-de-la-propiedad",
        label: "¿En qué estado está la propiedad?",
        autocomplete: "address-level1",
        source: autocompleteSource.usStates(),
        showWhen: {
          questionKey: "property_in_state",
          answer: "no",
        },
      }),
      step.choice({
        key: "ownership_status",
        slug: "dueno-o-renta",
        label: "¿Usted es dueño o renta esta propiedad?",
        options: [
          { key: "own", label: "Soy dueño/a" },
          { key: "rent", label: "Rento" },
        ],
      }),
      step.choice({
        key: "property_type",
        slug: "tipo-de-propiedad",
        label: "¿Qué tipo de propiedad quiere asegurar?",
        options: [
          { key: "single_family", label: propertyTypeLabels.single_family },
          { key: "condo", label: propertyTypeLabels.condo },
          { key: "townhouse", label: propertyTypeLabels.townhouse },
          { key: "mobile_home", label: propertyTypeLabels.mobile_home },
          { key: "multi_family", label: propertyTypeLabels.multi_family },
          { key: "other", label: propertyTypeLabels.other },
        ],
      }),
      step.choice({
        key: "property_use",
        slug: "uso-de-propiedad",
        label: "¿Cómo usa esta propiedad?",
        options: [
          { key: "primary_residence", label: propertyUseLabels.primary_residence },
          { key: "secondary_home", label: propertyUseLabels.secondary_home },
          { key: "rental_property", label: propertyUseLabels.rental_property },
          { key: "vacant", label: propertyUseLabels.vacant },
        ],
      }),
      step.choice({
        key: "has_home_insurance",
        slug: "tiene-seguro-de-vivienda",
        label: "¿Actualmente tiene seguro de vivienda?",
        options: [
          { key: "yes", label: "Si" },
          { key: "no", label: "No" },
        ],
      }),
      step.choice({
        key: "house_age_years",
        slug: "edad-de-la-vivienda",
        label: "¿Hace cuánto se construyó la vivienda?",
        options: [
          { key: "0_5", label: ageRangeLabels["0_5"] },
          { key: "6_10", label: ageRangeLabels["6_10"] },
          { key: "11_20", label: ageRangeLabels["11_20"] },
          { key: "21_plus", label: ageRangeLabels["21_plus"] },
        ],
      }),
      step.choice({
        key: "roof_age_years",
        slug: "edad-del-techo",
        label: "¿Qué edad tiene el techo?",
        options: [
          { key: "0_5", label: ageRangeLabels["0_5"] },
          { key: "6_10", label: ageRangeLabels["6_10"] },
          { key: "11_20", label: ageRangeLabels["11_20"] },
          { key: "21_plus", label: ageRangeLabels["21_plus"] },
        ],
      }),
      step.interstitial(
        {
          key: "matching_offer",
          slug: "buscando-opciones",
          label: "Estamos buscando opciones para su vivienda",
          countsAsStep: false,
          successLines: [
            { text: "¡Encontramos opciones para usted!", color: "brand-navy" },
            { text: "Descubra cuánto puede ahorrar...", color: "accent" },
          ],
        },
        ["property_state"],
        ({ context, answers }) => ({
          benefits: [
            text("Revisando los datos de la propiedad"),
            text("Buscando agentes disponibles"),
            text("Priorizando atención en español"),
            text("Preparando opciones en ", stateDisplay(answers.property_state ?? context.areaCode)),
          ],
        }),
      ),
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
        tracking: {
          stepAnswer: false,
        },
      }),
      step.trustedFormConsent(
        {
          key: "trustedform_consent",
          slug: "consentimiento",
          substeps: {
            consent: {
              presentation: {
                chrome: "hidden_on_mobile",
              },
            },
            review: {
              presentation: {
                chrome: "hidden_on_mobile",
              },
            },
          },
          trustedForm: trustedFormCertify({
            delivery: "main_thread",
            allowSubmitWithoutCert: true,
          }),
        },
        [
          "property_in_state",
          "property_state",
          "ownership_status",
          "property_type",
          "property_use",
          "has_home_insurance",
          "house_age_years",
          "roof_age_years",
          "first_name",
          "last_name",
          "phone_number",
        ],
        ({ context, answers }) => ({
          review: {
            title: text("Antes de cotizar"),
            description: md(
              "**Ya tenemos posibles opciones para usted**. Confirme que sus datos estén correctos antes de continuar.",
            ),
            nextLabel: "Continuar",
            fields: [
              {
                name: "trusted_form_grantor_name",
                label: "Nombre completo",
                value: text(answers.first_name, " ", answers.last_name),
                trustedForm: {
                  role: "consent-grantor-name",
                },
              },
              {
                name: "trusted_form_grantor_phone",
                label: "Teléfono",
                value: phoneDisplay(answers.phone_number),
                trustedForm: {
                  role: "consent-grantor-phone",
                },
              },
              {
                name: "review_property_state",
                label: "Estado de la propiedad",
                value: stateDisplay(answers.property_state ?? context.areaCode),
              },
              {
                name: "review_ownership_status",
                label: "Dueño o renta",
                value: text(answers.ownership_status === "own" ? "Soy dueño/a" : "Rento"),
              },
              {
                name: "review_property_type",
                label: "Tipo de propiedad",
                value: text(propertyTypeLabels[answers.property_type]),
              },
              {
                name: "review_property_use",
                label: "Uso de la propiedad",
                value: text(propertyUseLabels[answers.property_use]),
              },
              {
                name: "review_has_home_insurance",
                label: "Seguro actual",
                value: text(answers.has_home_insurance === "yes" ? "Sí" : "No"),
              },
              {
                name: "review_house_age_years",
                label: "Edad de la vivienda",
                value: text(ageRangeLabels[answers.house_age_years]),
              },
              {
                name: "review_roof_age_years",
                label: "Edad del techo",
                value: text(ageRangeLabels[answers.roof_age_years]),
              },
            ],
          },
          consent: {
            title: text("Antes de cotizar"),
            description: md(
              "Para proteger su privacidad, la ley requiere su autorización para comunicarnos con usted sobre su solicitud de seguro.",
            ),
            disclosure: consentMd(
              "Al marcar esta casilla y hacer clic en “Enviar”, yo, **",
              tfTag("consent-grantor-name", text(answers.first_name, " ", answers.last_name)),
              "**, autorizo a **",
              tfTag("consent-advertiser-name", context.advertiserName),
              "** a contactarme al **",
              tfTag("consent-grantor-phone", phoneDisplay(answers.phone_number)),
              "** sobre cotizaciones, productos y servicios de seguro de vivienda mediante",
              tfTag("contact-method", " llamadas, mensajes de texto y correos electrónicos,"),
              tfTag(
                "consent-grantor-waived-regulated-technologies",
                " incluso con marcación automática, voz artificial o pregrabada e inteligencia artificial, ",
              ),
              tfTag(
                "consent-grantor-waived-dnc",
                " aun si mi número figura en un registro federal o estatal de “No Llame” (DNC).",
              ),
              tfTag(
                "consent-grantor-waived-purchase-condition",
                " Entiendo que este consentimiento no es condición de compra",
              ),
              " y que puedo revocarlo en cualquier momento respondiendo STOP.",
            ),
            checkboxLabel: "Acepto continuar y enviar mi solicitud.",
            submitLabel: "Cotizar",
            validationMessage: "Debe aceptar el consentimiento para enviar la solicitud.",
          },
        }),
      ),
    ] as const;
}
