import { US_STATE_VALIDATION_MESSAGE, normalizeUsState } from "../../../shared/data/us-states";
import type {
  AutocompleteSourceDefinition,
  AutocompleteStep,
  BaseStep,
  CheckpointMode,
  ChoiceOptionInput,
  ChoiceStep,
  InterstitialStep,
  PhoneStep,
  StepBehavior,
  StepCondition,
  StepTemplateKey,
  TextStep,
  TrustedFormConsentStep,
  TrustedFormConsentStepInput,
} from "./types";

type RawStepCondition = {
  questionKey: string;
  answer: string;
};
type RawBaseStepInput = {
  key: string;
  slug: string;
  label: string;
  countsAsStep?: boolean;
  showWhen?: RawStepCondition;
};
type RawChoiceStepInput = RawBaseStepInput & {
  options: readonly ChoiceOptionInput[];
};
type RawTextStepInput = RawBaseStepInput & {
  type?: TextStep["type"];
  autocomplete: string;
};
type RawPhoneStepInput = RawBaseStepInput;
type RawAutocompleteStepInput = RawBaseStepInput & {
  source: AutocompleteSourceDefinition;
  autocomplete: string;
  inputMode?: "text";
  normalize?: (value: string) => string | undefined;
  validationMessage?: string;
};
type RawInterstitialStepInput = RawBaseStepInput & {
  loadingLabel?: string;
  successLines: readonly InterstitialStep["successLines"][number][];
  completionAnswer?: "completed";
  seenAnswer?: "seen";
  benefits: readonly string[];
};
type RawTrustedFormConsentStepInput = RawBaseStepInput & {
  disclosure: string;
  checkboxLabel?: string;
  submitLabel?: string;
  acceptedAnswer?: "accepted";
  validationMessage?: string;
  trustedForm?: TrustedFormConsentStepInput["trustedForm"];
  grantorSummary?: TrustedFormConsentStepInput["grantorSummary"];
};

type InputShowWhen<TInput> = TInput extends { readonly showWhen: infer TShowWhen }
  ? Extract<TShowWhen, StepCondition>
  : undefined;
type ChoiceOptionKey<TOptions extends readonly ChoiceOptionInput[]> = TOptions[number]["key"];

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
  choice<const TInput extends RawChoiceStepInput>(
    input: TInput,
  ): ChoiceStep<TInput["key"], ChoiceOptionKey<TInput["options"]>, InputShowWhen<TInput>> {
    return {
      ...baseStep(input, "choice", "answer", { autoAdvance: true }),
      kind: "choice",
      type: "CUSTOM",
      options: input.options.map((option) => ({ key: option.key, value: option.label })),
    };
  },

  text<const TInput extends RawTextStepInput>(input: TInput): TextStep<TInput["key"], InputShowWhen<TInput>> {
    return {
      ...baseStep(input, "text", "answer", { mobileBlurSubmit: true }),
      kind: "text",
      type: input.type ?? "FIRST_NAME",
      autocomplete: input.autocomplete,
      inputMode: "text",
    };
  },

  phone<const TInput extends RawPhoneStepInput>(input: TInput): PhoneStep<TInput["key"], InputShowWhen<TInput>> {
    return {
      ...baseStep(input, "phone", "answer", { mask: "us_phone", mobileBlurSubmit: true }),
      kind: "phone",
      type: "PHONE",
      autocomplete: "tel",
      inputMode: "tel",
    };
  },

  autocomplete<const TInput extends RawAutocompleteStepInput>(
    input: TInput,
  ): AutocompleteStep<TInput["key"], InputShowWhen<TInput>> {
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

  interstitial<const TInput extends RawInterstitialStepInput>(
    input: TInput,
  ): InterstitialStep<TInput["key"], InputShowWhen<TInput>> {
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

  trustedFormConsent<const TInput extends RawTrustedFormConsentStepInput>(
    input: TInput,
  ): TrustedFormConsentStep<TInput["key"], InputShowWhen<TInput>> {
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

function baseStep<const TInput extends RawBaseStepInput>(
  input: TInput,
  template: StepTemplateKey,
  checkpointMode: CheckpointMode,
  behavior: StepBehavior,
): BaseStep<TInput["key"], InputShowWhen<TInput>> {
  return {
    key: input.key,
    slug: input.slug,
    label: input.label,
    template,
    checkpointMode,
    behavior,
    countsAsStep: input.countsAsStep,
    showWhen: input.showWhen as InputShowWhen<TInput>,
  };
}
