export const esUiCopy = {
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
  scrollHints: {
    moreOptions: "Más opciones",
    moreContent: "Más",
  },
  pages: {
    nativeSubmissionError: {
      title: "No pudimos enviar el formulario",
      heading: "No pudimos enviar el formulario.",
      fallbackMessage: "No pudimos enviar el formulario.",
    },
  },
} as const;

export const esAutoInsurancePostSubmit = {
  slug: "gracias",
  title: "¡Estamos ansiosos por ayudarte a ahorrar $$$!",
  message: "Recibimos su información. Un agente se pondrá en contacto con usted pronto.",
  cta: {
    label: "¡Dele like a nuestra página!",
    href: "https://www.facebook.com/seguros.aseguranza",
  },
} as const;

export function createEsAutoInsurancePageMeta(areaDisplayName: string): { description: string; robots: string } {
  return {
    description: `Cotice seguro de auto en ${areaDisplayName} con Seguros Aseguranza. Complete un formulario corto para recibir opciones de cobertura disponibles.`,
    robots: "noindex,nofollow,nosnippet,noarchive,noimageindex,max-snippet:0,max-image-preview:none,max-video-preview:0",
  };
}
