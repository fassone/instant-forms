export type FormStatus = "ACTIVE" | "INACTIVE";

export type SourceStepType =
  | "CUSTOM"
  | "FIRST_NAME"
  | "LAST_NAME"
  | "PHONE"
  | "AUTOCOMPLETE"
  | "INTERSTITIAL"
  | "TRUSTED_FORM_CONSENT";

export type StepCondition = {
  questionKey: string;
  answer: string;
};

export type FormOption = {
  key: string;
  value: string;
};

export type StepTemplateKey = "choice" | "text" | "phone" | "autocomplete" | "interstitial" | "trusted_form_consent";

export type CheckpointMode = "answer" | "checkpoint_only";

export type StepBehavior = {
  autoAdvance?: boolean;
  mobileBlurSubmit?: boolean;
  mask?: "us_phone";
  suggestions?: "autocomplete";
  interstitialTiming?: "matching_offer";
  trustedForm?: "certify";
};

export type BaseStep = {
  key: string;
  slug: string;
  label: string;
  id: string;
  template: StepTemplateKey;
  checkpointMode: CheckpointMode;
  behavior: StepBehavior;
  countsAsStep?: boolean;
  showWhen?: StepCondition;
};

export type ChoiceStep = BaseStep & {
  kind: "choice";
  type: "CUSTOM";
  options: readonly FormOption[];
};

export type TextStep = BaseStep & {
  kind: "text";
  type: "FIRST_NAME" | "LAST_NAME";
  autocomplete: string;
  inputMode: "text";
};

export type PhoneStep = BaseStep & {
  kind: "phone";
  type: "PHONE";
  autocomplete: "tel";
  inputMode: "tel";
};

export type AutocompleteSourceKey = "us_states";

export type AutocompleteSourceDefinition = {
  key: AutocompleteSourceKey;
  clientKey: "usStates";
  normalize: (value: string) => string | undefined;
  validationMessage: string;
};

export type AutocompleteStep = BaseStep & {
  kind: "autocomplete";
  type: "AUTOCOMPLETE";
  autocomplete: string;
  inputMode: "text";
  source: AutocompleteSourceDefinition;
  validationMessage: string;
  normalize: (value: string) => string | undefined;
};

export type SuccessLineColor = "brand-navy" | "accent";

export type InterstitialSuccessLine = {
  text: string;
  color: SuccessLineColor;
};

export type InterstitialStep = BaseStep & {
  kind: "interstitial";
  type: "INTERSTITIAL";
  loadingLabel: string;
  successLines: readonly InterstitialSuccessLine[];
  completionAnswer: "completed";
  seenAnswer: "seen";
  benefits: readonly string[];
};

export type TrustedFormConsentConfig = {
  fieldName: string;
  delivery: "main_thread" | "partytown";
  scriptProxyKey?: string;
  scriptBaseUrl: string;
  partytownLib: string;
  partytownScriptUrl: string;
  useTaggedConsent: boolean;
  sandbox: boolean;
  preloadOnPreviousStep: boolean;
  allowSubmitWithoutCert: boolean;
};

export type TrustedFormGrantorSummary = {
  nameKeys: readonly string[];
  phoneKey?: string;
};

export type TrustedFormConsentStep = BaseStep & {
  kind: "trusted_form_consent";
  type: "TRUSTED_FORM_CONSENT";
  disclosure: string;
  checkboxLabel: string;
  submitLabel: string;
  acceptedAnswer: "accepted";
  validationMessage: string;
  trustedForm: TrustedFormConsentConfig;
  grantorSummary?: TrustedFormGrantorSummary;
};

export type FormStep =
  | ChoiceStep
  | TextStep
  | PhoneStep
  | AutocompleteStep
  | InterstitialStep
  | TrustedFormConsentStep;

export type InstantForm = {
  id: string;
  name: string;
  status: FormStatus;
  areaCode: string;
  page: {
    id: string;
    name: string;
  };
  steps: readonly FormStep[];
};

export type BaseStepInput = {
  key: string;
  slug: string;
  label: string;
  id?: string;
  countsAsStep?: boolean;
  showWhen?: StepCondition;
};

export type ChoiceStepInput = BaseStepInput & {
  options: readonly { key: string; label: string }[];
};

export type TextStepInput = BaseStepInput & {
  type?: TextStep["type"];
  autocomplete: string;
};

export type PhoneStepInput = BaseStepInput;

export type AutocompleteStepInput = BaseStepInput & {
  source: AutocompleteSourceDefinition;
  autocomplete: string;
  inputMode?: "text";
  normalize?: (value: string) => string | undefined;
  validationMessage?: string;
};

export type InterstitialStepInput = BaseStepInput & {
  loadingLabel?: string;
  successLines: readonly InterstitialSuccessLine[];
  completionAnswer?: "completed";
  seenAnswer?: "seen";
  benefits: readonly string[];
};

export type TrustedFormConsentStepInput = BaseStepInput & {
  disclosure: string;
  checkboxLabel?: string;
  submitLabel?: string;
  acceptedAnswer?: "accepted";
  validationMessage?: string;
  trustedForm?: Partial<TrustedFormConsentConfig>;
  grantorSummary?: TrustedFormGrantorSummary;
};

export type FormFlowInput = {
  id: string;
  name: string;
  status: FormStatus;
  areaCode: string;
  page: {
    id: string;
    name: string;
  };
  steps: readonly FormStep[];
};
