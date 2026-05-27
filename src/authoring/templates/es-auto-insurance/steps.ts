import { autocompleteSource } from "../../../platform/flow";
import type { FlowAuthoringHelpers } from "../../../platform/flow/dsl/step-builders";
import { trustedFormCertify } from "../../integrations/trusted-form";
import type { AutoInsuranceContract } from "./contracts";
import { slugifyTemplateValue } from "./formatting";

type CreateAutoInsuranceStepsInput = {
  areaDisplayName: string;
};

export function createAutoInsuranceSteps({ areaDisplayName }: CreateAutoInsuranceStepsInput) {
  return ({ step, text, md, phoneDisplay, stateDisplay, consentMd, tfTag }: FlowAuthoringHelpers<AutoInsuranceContract>) =>
    [
      step.choice({
        key: "belongs_to_state",
        slug: `vive-en-${slugifyTemplateValue(areaDisplayName)}`,
        label: `¿Usted vive en ${areaDisplayName}?`,
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
      step.interstitial(
        {
          key: "matching_offer",
          slug: "buscando-oferta",
          label: "Estamos buscando su seguro ideal",
          countsAsStep: false,
          successLines: [
            { text: "¡Encontramos opciones para usted!", color: "brand-navy" },
            { text: "Descubra cuánto puede ahorrar...", color: "accent" },
          ],
        },
        ["residence_state"],
        ({ context, answers }) => ({
          benefits: [
            text("Revisando sus respuestas"),
            text("Buscando agentes disponibles"),
            text("Priorizando atención en español"),
            text("Preparando opciones en ", stateDisplay(answers.residence_state ?? context.areaCode)),
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
          "belongs_to_state",
          "residence_state",
          "has_license",
          "has_insurance",
          "is_clean_title",
          "number_of_registered_cars",
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
                name: "review_residence_state",
                label: "Estado",
                value: stateDisplay(answers.residence_state ?? context.areaCode),
              },
              {
                name: "review_has_license",
                label: "Licencia de EE. UU.",
                value: text(answers.has_license === "yes" ? "Sí" : "No"),
              },
              {
                name: "review_has_insurance",
                label: "Seguro actual",
                value: text(answers.has_insurance === "yes" ? "Sí" : "No"),
              },
              {
                name: "review_is_clean_title",
                label: "Título limpio",
                value: text(answers.is_clean_title === "yes" ? "Sí" : "No"),
              },
              {
                name: "review_number_of_registered_cars",
                label: "Autos a asegurar",
                value: text(answers.number_of_registered_cars),
              },
            ],
          },
          consent: {
            title: text("Antes de cotizar"),
            description: md(
              "Para proteger su privacidad, la ley requiere su autorización para comunicarnos con usted sobre su solicitud de seguro.",
            ),
            // Replace with approved consent language before production traffic.
            disclosure: consentMd(
              "Al marcar esta casilla y hacer clic en “Enviar”, yo, **",
              tfTag("consent-grantor-name", text(answers.first_name, " ", answers.last_name)),
              "**, autorizo a **",
              tfTag("consent-advertiser-name", context.advertiserName),
              "** a contactarme al **",
              tfTag("consent-grantor-phone", phoneDisplay(answers.phone_number)),
              "** sobre cotizaciones, productos y servicios de seguro mediante",
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
