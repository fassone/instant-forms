import type { z } from "zod";

export type FormStatus = "ACTIVE" | "INACTIVE";

export type SourceStepType =
  | "CUSTOM"
  | "FIRST_NAME"
  | "LAST_NAME"
  | "PHONE"
  | "AUTOCOMPLETE"
  | "INTERSTITIAL"
  | "TRUSTED_FORM_CONSENT";

export type StepCondition<TQuestionKey extends string = string, TAnswer extends string = string> = {
  questionKey: TQuestionKey;
  answer: TAnswer;
};

export type FormOption<TKey extends string = string> = {
  key: TKey;
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

export type BaseStep<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = {
  key: TKey;
  slug: string;
  label: string;
  template: StepTemplateKey;
  checkpointMode: CheckpointMode;
  behavior: StepBehavior;
  countsAsStep?: boolean;
  showWhen?: TShowWhen;
};

export type ChoiceStep<
  TKey extends string = string,
  TOptionKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStep<TKey, TShowWhen> & {
  kind: "choice";
  type: "CUSTOM";
  options: readonly FormOption<TOptionKey>[];
};

export type TextStep<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStep<TKey, TShowWhen> & {
  kind: "text";
  type: "FIRST_NAME" | "LAST_NAME";
  autocomplete: string;
  inputMode: "text";
};

export type PhoneStep<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStep<TKey, TShowWhen> & {
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

export type AutocompleteStep<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStep<TKey, TShowWhen> & {
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

export type InterstitialStep<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStep<TKey, TShowWhen> & {
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

export type TrustedFormConsentStep<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStep<TKey, TShowWhen> & {
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

export type FormStep<TKey extends string = string> =
  | ChoiceStep<TKey, string, StepCondition | undefined>
  | TextStep<TKey, StepCondition | undefined>
  | PhoneStep<TKey, StepCondition | undefined>
  | AutocompleteStep<TKey, StepCondition | undefined>
  | InterstitialStep<TKey, StepCondition | undefined>
  | TrustedFormConsentStep<TKey, StepCondition | undefined>;

export type AnswerStep<TKey extends string = string> =
  | ChoiceStep<TKey, string, StepCondition | undefined>
  | TextStep<TKey, StepCondition | undefined>
  | PhoneStep<TKey, StepCondition | undefined>
  | AutocompleteStep<TKey, StepCondition | undefined>;

export type InstantForm = {
  name: string;
  status: FormStatus;
  contract: FormContract;
  context: Readonly<Record<string, string>>;
  customVariables: Readonly<Record<string, string>>;
  payload: FormPayloadDelivery;
  page: {
    name: string;
  };
  steps: readonly FormStep[];
};

export type FormContract = {
  context: z.ZodObject<z.ZodRawShape>;
  answers: z.ZodObject<z.ZodRawShape>;
  payload: z.ZodObject<z.ZodRawShape>;
};

export type ContractContext<TContract extends FormContract> = z.output<TContract["context"]>;
export type ContractContextInput<TContract extends FormContract> = z.input<TContract["context"]>;
export type ContractAnswers<TContract extends FormContract> = z.output<TContract["answers"]>;
export type ContractAnswersInput<TContract extends FormContract> = z.input<TContract["answers"]>;
export type ContractPayload<TContract extends FormContract> = z.output<TContract["payload"]>;
export type ContractPayloadInput<TContract extends FormContract> = z.input<TContract["payload"]>;
export type ContractSchemaKeys<TSchema> = TSchema extends z.ZodObject<infer TShape> ? Extract<keyof TShape, string> : never;

export type FormPayloadDelivery<TContract extends FormContract = FormContract> = {
  method: "POST";
  encoding: "json" | "form_urlencoded";
  mapping: (input: {
    context: ContractContext<TContract>;
    answers: ContractAnswers<TContract>;
  }) => ContractPayloadInput<TContract>;
};

export type BaseStepInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = {
  key: TKey;
  slug: string;
  label: string;
  countsAsStep?: boolean;
  showWhen?: TShowWhen;
};

export type ChoiceOptionInput<TKey extends string = string> = {
  key: TKey;
  label: string;
};

export type ChoiceStepInput<
  TKey extends string = string,
  TOptions extends readonly ChoiceOptionInput[] = readonly ChoiceOptionInput[],
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStepInput<TKey, TShowWhen> & {
  options: TOptions;
};

export type TextStepInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStepInput<TKey, TShowWhen> & {
  type?: TextStep["type"];
  autocomplete: string;
};

export type PhoneStepInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStepInput<TKey, TShowWhen>;

export type AutocompleteStepInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStepInput<TKey, TShowWhen> & {
  source: AutocompleteSourceDefinition;
  autocomplete: string;
  inputMode?: "text";
  normalize?: (value: string) => string | undefined;
  validationMessage?: string;
};

export type InterstitialStepInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStepInput<TKey, TShowWhen> & {
  loadingLabel?: string;
  successLines: readonly InterstitialSuccessLine[];
  completionAnswer?: "completed";
  seenAnswer?: "seen";
  benefits: readonly string[];
};

export type TrustedFormConsentStepInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = BaseStepInput<TKey, TShowWhen> & {
  disclosure: string;
  checkboxLabel?: string;
  submitLabel?: string;
  acceptedAnswer?: "accepted";
  validationMessage?: string;
  trustedForm?: Partial<TrustedFormConsentConfig>;
  grantorSummary?: TrustedFormGrantorSummary;
};

export type AnswerStepKey<TStep extends FormStep> = TStep extends AnswerStep ? TStep["key"] : never;
export type ContractAnswerKey<TContract extends FormContract> = ContractSchemaKeys<TContract["answers"]>;
export type ContractAnswerValue<TContract extends FormContract, TKey extends string> = TKey extends keyof ContractAnswers<TContract>
  ? Extract<ContractAnswers<TContract>[TKey], string>
  : never;
export type UnknownAnswerStepKeys<
  TContract extends FormContract,
  TSteps extends readonly FormStep[],
> = Exclude<AnswerStepKey<TSteps[number]>, ContractAnswerKey<TContract>>;
export type MissingAnswerStepKeys<
  TContract extends FormContract,
  TSteps extends readonly FormStep[],
> = Exclude<ContractAnswerKey<TContract>, AnswerStepKey<TSteps[number]>>;
export type UnknownChoiceOptionKeys<
  TContract extends FormContract,
  TSteps extends readonly FormStep[],
> = TSteps[number] extends infer TStep
  ? TStep extends ChoiceStep<infer TKey, infer TOptionKey, StepCondition | undefined>
    ? Exclude<TOptionKey, ContractAnswerValue<TContract, TKey>>
    : never
  : never;
export type MissingChoiceOptionKeys<
  TContract extends FormContract,
  TSteps extends readonly FormStep[],
> = TSteps[number] extends infer TStep
  ? TStep extends ChoiceStep<infer TKey, infer TOptionKey, StepCondition | undefined>
    ? Exclude<ContractAnswerValue<TContract, TKey>, TOptionKey>
    : never
  : never;
export type StepShowWhen<TStep> = TStep extends BaseStep<string, infer TShowWhen> ? TShowWhen : never;
export type StepShowWhenCondition<TStep> = Extract<StepShowWhen<TStep>, StepCondition>;
export type NarrowString<TValue> = TValue extends string ? (string extends TValue ? never : TValue) : never;
export type UnknownShowWhenQuestionKeys<
  TContract extends FormContract,
  TSteps extends readonly FormStep[],
> = TSteps[number] extends infer TStep
  ? StepShowWhenCondition<TStep> extends StepCondition<infer TQuestionKey, string>
    ? Exclude<NarrowString<TQuestionKey>, ContractAnswerKey<TContract>>
    : never
  : never;
export type InvalidShowWhenAnswers<
  TContract extends FormContract,
  TSteps extends readonly FormStep[],
> = TSteps[number] extends infer TStep
  ? StepShowWhenCondition<TStep> extends StepCondition<infer TQuestionKey, infer TAnswer>
    ? NarrowString<TQuestionKey> extends never
      ? never
      : Exclude<NarrowString<TAnswer>, ContractAnswerValue<TContract, NarrowString<TQuestionKey>>>
    : never
  : never;
export type EnforceAnswerStepKeys<TContract extends FormContract, TSteps extends readonly FormStep[]> =
  (UnknownAnswerStepKeys<TContract, TSteps> extends never
    ? unknown
    : { readonly __unknownAnswerStepKeys: UnknownAnswerStepKeys<TContract, TSteps> }) &
  (MissingAnswerStepKeys<TContract, TSteps> extends never
    ? unknown
    : { readonly __missingAnswerStepKeys: MissingAnswerStepKeys<TContract, TSteps> }) &
  (UnknownChoiceOptionKeys<TContract, TSteps> extends never
    ? unknown
    : { readonly __unknownChoiceOptionKeys: UnknownChoiceOptionKeys<TContract, TSteps> }) &
  (MissingChoiceOptionKeys<TContract, TSteps> extends never
    ? unknown
    : { readonly __missingChoiceOptionKeys: MissingChoiceOptionKeys<TContract, TSteps> }) &
  (UnknownShowWhenQuestionKeys<TContract, TSteps> extends never
    ? unknown
    : { readonly __unknownShowWhenQuestionKeys: UnknownShowWhenQuestionKeys<TContract, TSteps> }) &
  (InvalidShowWhenAnswers<TContract, TSteps> extends never
    ? unknown
    : { readonly __invalidShowWhenAnswers: InvalidShowWhenAnswers<TContract, TSteps> });

export type FormFlowInput<
  TContract extends FormContract = FormContract,
  TSteps extends readonly FormStep[] = readonly FormStep[],
> = {
  name: string;
  status: FormStatus;
  contract: TContract;
  context: Readonly<Partial<ContractContextInput<TContract>>>;
  payload: FormPayloadDelivery<TContract>;
  page: {
    name: string;
  };
  steps: TSteps;
} & EnforceAnswerStepKeys<TContract, TSteps>;
