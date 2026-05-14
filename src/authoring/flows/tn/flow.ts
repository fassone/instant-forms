import { defineFormFlow } from "../../../platform/flow/dsl/define-form-flow";
import { autocompleteSource, step } from "../../../platform/flow/dsl/step-builders";

export const tnFlow = defineFormFlow({
  id: "1011189481863371",
  name: "ES - TN - v6",
  status: "ACTIVE",
  areaCode: "tn",
  page: {
    id: "298730479987891",
    name: "Seguros Aseguranza",
  },
  steps: [
    step.choice({
      key: "belongs_to_state",
      slug: "vive-en-tennessee",
      label: "¿Usted vive en Tennessee?",
      id: "1653615922583282",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.autocomplete({
      key: "residence_state",
      slug: "estado-donde-vive",
      label: "¿En qué estado vive?",
      id: "residence_state",
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
      id: "782123394910922",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.choice({
      key: "has_insurance",
      slug: "tiene-seguro",
      label: "¿Usted tiene seguro de los Estado Unidos?",
      id: "2197559684116183",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.choice({
      key: "is_clean_title",
      slug: "titulo-limpio",
      label: "¿Su auto tiene título limpio?",
      id: "1044815071204693",
      options: [
        { key: "yes", label: "Si" },
        { key: "no", label: "No" },
      ],
    }),
    step.choice({
      key: "number_of_registered_cars",
      slug: "autos-a-asegurar",
      label: "¿Cuantos autos quiere asegurar?",
      id: "1000790812295278",
      options: [
        { key: "1", label: "1" },
        { key: "2+", label: "2+" },
      ],
    }),
    step.interstitial({
      key: "matching_offer",
      slug: "buscando-oferta",
      label: "Estamos buscando su seguro ideal",
      id: "matching_offer",
      countsAsStep: false,
      benefits: [
        "Revisando sus respuestas",
        "Buscando agentes disponibles",
        "Priorizando atención en español",
        "Preparando opciones en {{areaName}}",
      ],
      successLines: [
        { text: "Encontramos agentes listos para cotizarle.", color: "brand-navy" },
        { text: "Descubra cuánto puede ahorrar.", color: "accent" },
      ],
    }),
    step.text({
      key: "first_name",
      slug: "nombre",
      label: "Nombre",
      id: "1283697083392173",
      type: "FIRST_NAME",
      autocomplete: "given-name",
    }),
    step.text({
      key: "last_name",
      slug: "apellido",
      label: "Apellido",
      id: "1529546892176037",
      type: "LAST_NAME",
      autocomplete: "family-name",
    }),
    step.phone({
      key: "phone_number",
      slug: "telefono",
      label: "Número de teléfono",
      id: "1594967471565670",
    }),
  ],
});
