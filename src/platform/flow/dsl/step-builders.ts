import { US_STATE_VALIDATION_MESSAGE, normalizeUsState } from "../../../shared/data/us-states";
import type {
  AutocompleteSourceDefinition,
  AutocompleteStep,
  AutocompleteStepInput,
  BaseStep,
  BaseStepInput,
  CheckpointMode,
  ChoiceStep,
  ChoiceStepInput,
  InterstitialStep,
  InterstitialStepInput,
  PhoneStep,
  PhoneStepInput,
  StepBehavior,
  StepTemplateKey,
  TextStep,
  TextStepInput,
  TrustedFormConsentStep,
  TrustedFormConsentStepInput,
} from "./types";

export const autocompleteSource = {
  usStates(): AutocompleteSourceDefinition {
    return {
      key: "us_states",
      clientKey: "usStates",
      normalize: normalizeUsState,
      validationMessage: US_STATE_VALIDATION_MESSAGE,
    };
  },
} as const;

export const step = {
  choice(input: ChoiceStepInput): ChoiceStep {
    return {
      ...baseStep(input, "choice", "answer", { autoAdvance: true }),
      kind: "choice",
      type: "CUSTOM",
      options: input.options.map((option) => ({ key: option.key, value: option.label })),
    };
  },

  text(input: TextStepInput): TextStep {
    return {
      ...baseStep(input, "text", "answer", { mobileBlurSubmit: true }),
      kind: "text",
      type: input.type ?? "FIRST_NAME",
      autocomplete: input.autocomplete,
      inputMode: "text",
    };
  },

  phone(input: PhoneStepInput): PhoneStep {
    return {
      ...baseStep(input, "phone", "answer", { mask: "us_phone", mobileBlurSubmit: true }),
      kind: "phone",
      type: "PHONE",
      autocomplete: "tel",
      inputMode: "tel",
    };
  },

  autocomplete(input: AutocompleteStepInput): AutocompleteStep {
    return {
      ...baseStep(input, "autocomplete", "answer", { suggestions: "autocomplete" }),
      kind: "autocomplete",
      type: "AUTOCOMPLETE",
      autocomplete: input.autocomplete,
      inputMode: input.inputMode ?? "text",
      source: input.source,
      validationMessage: input.validationMessage ?? input.source.validationMessage,
      normalize: input.normalize ?? input.source.normalize,
    };
  },

  interstitial(input: InterstitialStepInput): InterstitialStep {
    return {
      ...baseStep(input, "interstitial", "checkpoint_only", { interstitialTiming: "matching_offer" }),
      kind: "interstitial",
      type: "INTERSTITIAL",
      loadingLabel: input.loadingLabel ?? "",
      successLines: input.successLines,
      completionAnswer: input.completionAnswer ?? "completed",
      seenAnswer: input.seenAnswer ?? "seen",
      benefits: input.benefits,
    };
  },

  trustedFormConsent(input: TrustedFormConsentStepInput): TrustedFormConsentStep {
    return {
      ...baseStep(input, "trusted_form_consent", "checkpoint_only", { trustedForm: "certify" }),
      kind: "trusted_form_consent",
      type: "TRUSTED_FORM_CONSENT",
      disclosure: input.disclosure,
      checkboxLabel: input.checkboxLabel ?? "Acepto y quiero enviar mi solicitud.",
      submitLabel: input.submitLabel ?? "Enviar",
      acceptedAnswer: input.acceptedAnswer ?? "accepted",
      validationMessage: input.validationMessage ?? "Debe aceptar el consentimiento para enviar la solicitud.",
      trustedForm: {
        fieldName: input.trustedForm?.fieldName ?? "xxTrustedFormCertUrl",
        delivery: input.trustedForm?.delivery ?? "main_thread",
        scriptProxyKey: input.trustedForm?.scriptProxyKey,
        scriptBaseUrl:
          input.trustedForm?.scriptBaseUrl ??
          (input.trustedForm?.scriptProxyKey
            ? `/_instant/scripts/${input.trustedForm.scriptProxyKey}.js`
            : "https://api.trustedform.com/trustedform.js"),
        partytownLib: input.trustedForm?.partytownLib ?? "/~partytown/",
        partytownScriptUrl: input.trustedForm?.partytownScriptUrl ?? "/~partytown/partytown.js",
        useTaggedConsent: input.trustedForm?.useTaggedConsent ?? true,
        sandbox: input.trustedForm?.sandbox ?? false,
        preloadOnPreviousStep: input.trustedForm?.preloadOnPreviousStep ?? true,
        allowSubmitWithoutCert: input.trustedForm?.allowSubmitWithoutCert ?? true,
      },
      grantorSummary: input.grantorSummary,
    };
  },
} as const;

function baseStep(
  input: BaseStepInput,
  template: StepTemplateKey,
  checkpointMode: CheckpointMode,
  behavior: StepBehavior,
): BaseStep {
  return {
    key: input.key,
    slug: input.slug,
    label: input.label,
    id: input.id ?? input.key,
    template,
    checkpointMode,
    behavior,
    countsAsStep: input.countsAsStep,
    showWhen: input.showWhen,
  };
}
