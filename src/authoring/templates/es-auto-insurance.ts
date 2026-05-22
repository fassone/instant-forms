import { autocompleteSource, defineFormFlow, defineFormTemplate, z } from "../../platform/flow";

const esUiCopy = {
  actions: {
    back: "Atrás",
    next: "Siguiente",
    submit: "Enviar",
    loading: "Enviando...",
  },
  progress: {
    stepCount: "Paso {{current}} de {{total}}",
  },
  errorModal: {
    title: "Revise esta respuesta",
    closeLabel: "Entendido",
  },
  errors: {
    requiredAnswer: "Esta respuesta es requerida.",
    invalidChoice: "Seleccione una opción válida.",
    invalidPhone: "Ingrese un número de teléfono válido de Estados Unidos.",
    invalidAutocomplete: "Ingrese un estado válido de Estados Unidos.",
    unavailableQuestion: "Esta pregunta no está disponible.",
    incompleteStep: "No pudimos completar este paso.",
    checkpointSaveFailed: "No pudimos guardar esta respuesta.",
    checkpointStepSaveFailed: "No pudimos guardar este paso.",
    stepResolutionFailed: "No pudimos preparar este paso.",
    submissionFailed: "No pudimos enviar el formulario.",
    trustedFormCertFailed:
      "No pudimos preparar el certificado de consentimiento. Revise su conexión e intente de nuevo.",
  },
  pages: {
    thankYou: {
      title: "Gracias.",
      message: "Recibimos su información. Un agente se pondrá en contacto con usted pronto.",
    },
    nativeSubmissionError: {
      title: "No pudimos enviar el formulario",
      heading: "No pudimos enviar el formulario.",
      fallbackMessage: "No pudimos enviar el formulario.",
    },
  },
} as const;

const autoInsuranceAnswersContract = z.object({
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

const autoInsurancePayloadContract = z.object({
  marketState: z.string(),
  marketName: z.string(),
  product: z.string(),
  phone: z.string(),
});

export const esAutoInsuranceVariables = z.object({
  flowName: z.string(),
  pageName: z.string(),
  areaCode: z.string(),
  areaName: z.string().optional(),
  product: z.string(),
  advertiserName: z.string(),
});

export const esAutoInsuranceTemplate = defineFormTemplate({
  variables: esAutoInsuranceVariables,
  create: ({ variables }) => {
    const areaDisplayName = variables.areaName ?? variables.areaCode;

    return defineFormFlow({
      name: variables.flowName,
      status: "ACTIVE",
      locale: "es",
      ui: esUiCopy,
      contract: {
        context: z.object({
          areaCode: z.string(),
          areaName: z.string().optional(),
          product: z.string(),
          advertiserName: z.string(),
        }),
        answers: autoInsuranceAnswersContract,
        payload: autoInsurancePayloadContract,
      },
      context: {
        areaCode: variables.areaCode,
        areaName: variables.areaName,
        product: variables.product,
        advertiserName: variables.advertiserName,
      },
      payload: {
        method: "POST",
        encoding: "json",
        mapping: ({ context, answers }) => ({
          marketState: context.areaCode,
          marketName: context.areaName ?? context.areaCode,
          product: context.product,
          phone: answers.phone_number,
        }),
      },
      page: {
        name: variables.pageName,
      },
      steps: ({ step, text, md, phoneDisplay, stateDisplay, consentMd, tfTag }) => [
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
              { text: "Encontramos agentes listos para cotizarle.", color: "brand-navy" },
              { text: "Descubra cuánto puede ahorrar.", color: "accent" },
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
            trustedForm: {
              fieldName: "xxTrustedFormCertUrl",
              delivery: "main_thread",
              scriptProxyKey: "tfc",
              scriptBaseUrl: "/_instant/scripts/trustedform.com/tfc.js",
              preloadAssets: "when_reachable",
              execute: "on_review_mount",
              requireReadyBefore: "consent_substep",
              allowSubmitWithoutCert: true,
            },
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
              description: md("**Ya tenemos posibles opciones para usted**. Confirme que sus datos estén correctos antes de continuar."),
              nextLabel: "Continuar",
              fields: [
                {
                  name: "review_belongs_to_state",
                  label: `Vive en ${areaDisplayName}`,
                  value: text(answers.belongs_to_state === "yes" ? "Sí" : "No"),
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
              ],
            },
            consent: {
              title: text("Antes de cotizar"),
              description: md("Para proteger su privacidad, la ley requiere su autorización para comunicarnos con usted sobre su solicitud de seguro."),
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
                tfTag("consent-grantor-waived-regulated-technologies", " incluso con marcación automática, voz artificial o pregrabada e inteligencia artificial, "),
                tfTag("consent-grantor-waived-dnc", " aun si mi número figura en un registro federal o estatal de “No Llame” (DNC)."),
                tfTag("consent-grantor-waived-purchase-condition", " Entiendo que este consentimiento no es condición de compra"),
                " y que puedo revocarlo en cualquier momento respondiendo STOP.",
              ),
              checkboxLabel: "Acepto continuar y enviar mi solicitud.",
              submitLabel: "Cotizar",
              validationMessage: "Debe aceptar el consentimiento para enviar la solicitud.",
            },
          }),
        ),
      ],
    });
  },
});

function slugifyTemplateValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
