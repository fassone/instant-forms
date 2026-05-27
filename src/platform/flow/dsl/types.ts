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

export type StepChromePresentation = "visible" | "hidden" | "hidden_on_mobile";

export type StepPresentation = {
  chrome?: StepChromePresentation;
};

export type TrustedFormSubstepPresentation = {
  presentation?: StepPresentation;
};

export type TrustedFormConsentSubstepsPresentation = {
  review?: TrustedFormSubstepPresentation;
  consent?: TrustedFormSubstepPresentation;
};

export type FormPagePresentation = {
  desktopHeightPx?: number;
};

export type FormPage = {
  name: string;
  presentation?: FormPagePresentation;
};

export type FormPostSubmit = {
  slug: string;
  title: string;
  message: string;
  cta?: {
    label: string;
    href: string;
  };
};

export type AttributionCookieOptions = {
  path?: string;
  maxAge?: number;
  sameSite?: "Strict" | "Lax" | "None" | "strict" | "lax" | "none";
  httpOnly?: boolean;
  secure?: boolean;
};

export type AttributionCookieHelpers = {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options?: AttributionCookieOptions) => void;
};

export type FormAttribution = {
  preserveQueryParams: readonly string[];
  capture?: (input: {
    url: URL;
    now: Date;
    cookies: AttributionCookieHelpers;
  }) => void;
};

export type GoogleTagManagerContainerId = `GTM-${string}`;
export type GoogleTagManagerDelivery = "partytown";
export type GoogleTagManagerProxy = "first_party";

export type GoogleTagManagerConfig<TContextKey extends string = string> = {
  containerId: GoogleTagManagerContainerId;
  delivery: GoogleTagManagerDelivery;
  proxy: GoogleTagManagerProxy;
  dataLayerName: "dataLayer";
  scriptProxyKey: "gtm";
  scriptBaseUrl: "/_instant/scripts/gtm.js";
  partytownLib: "/~partytown/";
  partytownScriptUrl: "/~partytown/partytown.js";
};

export type TrackingEventKind =
  | "formView"
  | "stepView"
  | "stepAnswer"
  | "validationError"
  | "trustedFormSubstepView"
  | "submitAttempt"
  | "submitSuccess"
  | "submitError";

export type ServerTrackingEventKind = "stepAnswer" | "trustedFormSubstepView" | "submitSuccess";
export type MetaPixelId = string;
export type MetaUserDataKey = "ph" | "em" | "fn" | "ln" | "ct" | "st" | "zp" | "country" | "external_id";

export type TrackingSubmissionContext = {
  id: string;
};

export type TrackingRuntimeEventContext = {
  id: string;
  kind: TrackingEventKind;
  trustedFormSubstep?: "review" | "consent";
};

export type TrackingRuntimeStepContext = {
  key: string;
  slug: string;
  kind: string;
  index?: number;
};

export type TrackingServerMetaPayload = {
  pixel_id: string;
  event_name: string;
  event_id: string;
  action_source: string;
  event_source_url?: string;
  user_data: Record<string, string>;
  custom_data: Record<string, string | number | boolean>;
  test_event_code?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  [key: string]: unknown;
};

export type TrackingServerEventPayload = {
  event: string;
  id: string;
  meta?: TrackingServerMetaPayload;
  [key: string]: unknown;
};

export type TrackingServerCookieHelpers = {
  get: (name: string) => string | undefined;
};

export type TrackingServerRequest = {
  url: string;
  ip?: string;
  userAgent?: string;
  headers: Headers;
};

export type TrackingServerEventInput<TContract extends FormContract = FormContract> = {
  event: TrackingServerEventPayload;
  context: ContractContext<TContract>;
  answers: ContractAnswers<TContract>;
  cookies: TrackingServerCookieHelpers;
  request: TrackingServerRequest;
  submission?: TrackingSubmissionContext;
  step?: TrackingRuntimeStepContext;
};

export type TrackingMetaMapping<TContract extends FormContract = FormContract> = {
  pixelId: MetaPixelId;
  eventName: string;
  testEventCode?: string;
  eventId?: (input: {
    context: ContractContext<TContract>;
    answers: ContractAnswers<TContract>;
    submission: TrackingSubmissionContext;
    event: TrackingRuntimeEventContext;
    step?: TrackingRuntimeStepContext;
  }) => string;
  userData?: (input: {
    context: ContractContext<TContract>;
    answers: ContractAnswers<TContract>;
    submission: TrackingSubmissionContext;
    event: TrackingRuntimeEventContext;
    step?: TrackingRuntimeStepContext;
  }) => Partial<Record<MetaUserDataKey, string | TextValue | undefined>>;
  customData?: (input: {
    context: ContractContext<TContract>;
    answers: ContractAnswers<TContract>;
    submission: TrackingSubmissionContext;
    event: TrackingRuntimeEventContext;
    step?: TrackingRuntimeStepContext;
  }) => Record<string, string | number | boolean | undefined>;
};

type TrackingServerCallbackConfig<
  TKind extends TrackingEventKind,
  TContract extends FormContract,
> = TKind extends ServerTrackingEventKind
  ? {
      server?: (input: TrackingServerEventInput<TContract>) => void | Promise<void>;
    }
  : {
      server?: never;
    };

export type TrackingEventConfig<
  TKind extends TrackingEventKind = TrackingEventKind,
  TContextKey extends string = string,
  TContract extends FormContract = FormContract,
> = {
  kind: TKind;
  name: string;
  includeContext?: readonly TContextKey[];
  includeStep?: boolean;
  meta?: TrackingMetaMapping<TContract>;
} & TrackingServerCallbackConfig<TKind, TContract>;

export type TrackingEventInput<
  TKind extends TrackingEventKind,
  TContextKey extends string,
  TContract extends FormContract,
> = Omit<TrackingEventConfig<TKind, TContextKey, TContract>, "kind">;

export type StepTrackingEventOverride<TContextKey extends string = string> =
  | false
  | {
      name: string;
      includeContext?: readonly TContextKey[];
      includeStep?: boolean;
    };

export type StepTracking<TContextKey extends string = string> = Partial<
  Record<Exclude<TrackingEventKind, "formView" | "submitSuccess">, StepTrackingEventOverride<TContextKey>>
>;

export type FormTracking<TContract extends FormContract = FormContract> = {
  googleTagManager?: GoogleTagManagerConfig<ContractSchemaKeys<TContract["context"]>>;
  events?: readonly TrackingEventConfig<
    TrackingEventKind,
    ContractSchemaKeys<TContract["context"]>,
    TContract
  >[];
};

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
  presentation?: StepPresentation;
  tracking?: StepTracking;
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

declare const textValueBrand: unique symbol;

export type TextValue = string & {
  readonly [textValueBrand]: "TextValue";
};

export type TextPart = string | number | boolean | TextValue;

declare const markdownValueBrand: unique symbol;
declare const consentMarkdownValueBrand: unique symbol;
declare const trustedFormConsentTagTokenBrand: unique symbol;

export type MarkdownValue = string & {
  readonly [markdownValueBrand]: "MarkdownValue";
};

export type PlainTextValue = string & {
  readonly [markdownValueBrand]?: never;
  readonly [consentMarkdownValueBrand]?: never;
  readonly [trustedFormConsentTagTokenBrand]?: never;
};

export type MarkdownPart = string | number | boolean | TextValue | MarkdownValue;
export type PhoneDisplayInput = string | TextValue;
export type StateDisplayInput = string | TextValue;
export type TrustedFormTagTextPart = string | number | boolean | TextValue;

export type TrustedFormConsentInlineTagRole =
  | "submit-text"
  | "consent-advertiser-name"
  | "contact-method"
  | "consent-grantor-name"
  | "consent-grantor-phone"
  | "consent-grantor-email"
  | "consent-grantor-address"
  | "consent-grantor-waived-dnc"
  | "consent-grantor-waived-purchase-condition"
  | "consent-grantor-waived-regulated-technologies";

export type TrustedFormConsentTagToken = string & {
  readonly [trustedFormConsentTagTokenBrand]: "TrustedFormConsentTagToken";
};

export type ConsentMarkdownValue = string & {
  readonly [consentMarkdownValueBrand]: "ConsentMarkdownValue";
  readonly [markdownValueBrand]?: never;
};

export type ConsentMarkdownPart = MarkdownPart | TrustedFormConsentTagToken;

export type DynamicResolverContext<
  TDependency extends string = string,
  TResult = unknown,
> = {
  readonly __kind: "dynamic_resolver";
  readonly dependencies: readonly TDependency[];
  readonly resolve: (input: {
    context: Readonly<Record<string, string | undefined>>;
    answers: Readonly<Record<TDependency, string>>;
  }) => TResult;
};

export type ResolvableValue<
  TStaticValue,
  TResolvedValue = TStaticValue,
  TDependency extends string = string,
> = TStaticValue | DynamicResolverContext<TDependency, TResolvedValue>;

export type StepDynamicResolver<
  TDependency extends string = string,
  TResult = unknown,
> = DynamicResolverContext<TDependency, TResult>;

export type DisplayPlainString = string & {
  readonly [consentMarkdownValueBrand]?: never;
  readonly [trustedFormConsentTagTokenBrand]?: never;
};

export type DisplayCopy = DisplayPlainString | MarkdownValue;
export type ConsentDisclosureCopy = ConsentMarkdownValue;

export type InterstitialStepDynamicBody = {
  label?: PlainTextValue;
  loadingLabel?: PlainTextValue;
  successLines?: readonly InterstitialSuccessLine[];
  benefits: readonly TextValue[];
};

export type InterstitialStep<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
  TDynamic extends StepDynamicResolver<string, InterstitialStepDynamicBody> | undefined =
    | StepDynamicResolver<string, InterstitialStepDynamicBody>
    | undefined,
> = BaseStep<TKey, TShowWhen> & {
  kind: "interstitial";
  type: "INTERSTITIAL";
  loadingLabel: string;
  successLines: readonly InterstitialSuccessLine[];
  completionAnswer: "completed";
  seenAnswer: "seen";
  benefits: readonly string[];
  dynamic?: TDynamic;
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
  preloadAssets: "when_reachable" | "previous_step" | "never";
  execute: "on_step_mount";
  requireReadyBefore: "consent_substep";
  allowSubmitWithoutCert: boolean;
};

export type TrustedFormConsentFieldRole =
  | "consent-grantor-name"
  | "consent-grantor-phone"
  | "consent-grantor-email";

export type TrustedFormConsentFieldTag = {
  role: TrustedFormConsentFieldRole;
};

export type TrustedFormReviewField = {
  name: PlainTextValue;
  label: PlainTextValue;
  value: PlainTextValue;
  trustedForm?: TrustedFormConsentFieldTag;
};

export type ResolverTrustedFormReviewField = {
  name: PlainTextValue;
  label: PlainTextValue;
  value: TextValue;
  trustedForm?: TrustedFormConsentFieldTag;
};

export type TrustedFormReview<
  TTitle extends PlainTextValue = PlainTextValue,
  TDescription extends DisplayCopy | undefined = DisplayCopy | undefined,
  TFields extends readonly TrustedFormReviewField[] = readonly TrustedFormReviewField[],
> = {
  title: TTitle;
  description?: TDescription;
  nextLabel: PlainTextValue;
  fields: TFields;
};

export type TrustedFormReviewInput<
  TTitle extends PlainTextValue = PlainTextValue,
  TDescription extends DisplayCopy | undefined = DisplayCopy | undefined,
  TFields extends readonly TrustedFormReviewField[] = readonly TrustedFormReviewField[],
> = {
  title: TTitle;
  description?: TDescription;
  nextLabel?: PlainTextValue;
  fields: TFields;
  presentation?: never;
};

export type TrustedFormConsentCopy<
  TTitle extends PlainTextValue = PlainTextValue,
  TDescription extends DisplayCopy | undefined = DisplayCopy | undefined,
  TDisclosure extends ConsentDisclosureCopy = ConsentDisclosureCopy,
> = {
  title: TTitle;
  description?: TDescription;
  disclosure: TDisclosure;
  checkboxLabel: PlainTextValue;
  submitLabel: PlainTextValue;
  validationMessage: PlainTextValue;
};

export type TrustedFormConsentCopyInput<
  TTitle extends PlainTextValue = PlainTextValue,
  TDescription extends DisplayCopy | undefined = DisplayCopy | undefined,
  TDisclosure extends ConsentDisclosureCopy = ConsentDisclosureCopy,
> = {
  title: TTitle;
  description?: TDescription;
  disclosure: TDisclosure;
  checkboxLabel?: PlainTextValue;
  submitLabel?: PlainTextValue;
  validationMessage?: PlainTextValue;
  presentation?: never;
};

export type TrustedFormConsentStepDynamicBody = {
  review: TrustedFormReviewInput<TextValue, MarkdownValue | undefined, readonly ResolverTrustedFormReviewField[]>;
  consent: TrustedFormConsentCopyInput<TextValue, MarkdownValue | undefined, ConsentMarkdownValue>;
  substeps?: never;
};

export type TrustedFormConsentStep<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
  TReviewTitle extends PlainTextValue = PlainTextValue,
  TReviewDescription extends DisplayCopy | undefined = DisplayCopy | undefined,
  TReviewFields extends readonly TrustedFormReviewField[] = readonly TrustedFormReviewField[],
  TConsentTitle extends PlainTextValue = PlainTextValue,
  TConsentDescription extends DisplayCopy | undefined = DisplayCopy | undefined,
  TDisclosure extends ConsentDisclosureCopy = ConsentDisclosureCopy,
  TDynamic extends StepDynamicResolver<string, TrustedFormConsentStepDynamicBody> | undefined =
    | StepDynamicResolver<string, TrustedFormConsentStepDynamicBody>
    | undefined,
> = BaseStep<TKey, TShowWhen> & {
  kind: "trusted_form_consent";
  type: "TRUSTED_FORM_CONSENT";
  review: TrustedFormReview<TReviewTitle, TReviewDescription, TReviewFields>;
  consent: TrustedFormConsentCopy<TConsentTitle, TConsentDescription, TDisclosure>;
  substeps?: TrustedFormConsentSubstepsPresentation;
  acceptedAnswer: "accepted";
  trustedForm: TrustedFormConsentConfig;
  dynamic?: TDynamic;
};

export type FormStep<TKey extends string = string> =
  | ChoiceStep<TKey, string, StepCondition | undefined>
  | TextStep<TKey, StepCondition | undefined>
  | PhoneStep<TKey, StepCondition | undefined>
  | AutocompleteStep<TKey, StepCondition | undefined>
  | InterstitialStep<TKey, StepCondition | undefined>
  | TrustedFormConsentStep<
      TKey,
      StepCondition | undefined,
      PlainTextValue,
      DisplayCopy | undefined,
      readonly TrustedFormReviewField[],
      PlainTextValue,
      DisplayCopy | undefined,
      ConsentDisclosureCopy
    >;

export type AnswerStep<TKey extends string = string> =
  | ChoiceStep<TKey, string, StepCondition | undefined>
  | TextStep<TKey, StepCondition | undefined>
  | PhoneStep<TKey, StepCondition | undefined>
  | AutocompleteStep<TKey, StepCondition | undefined>;

export type FormUiActionCopy = {
  back: string;
  next: string;
  submit: string;
  loading: string;
};

export type FormUiProgressCopy = {
  stepCount: string;
};

export type FormUiErrorModalCopy = {
  title: string;
  closeLabel: string;
};

export type FormUiErrorCopy = {
  requiredAnswer: string;
  invalidChoice: string;
  invalidPhone: string;
  invalidAutocomplete: string;
  unavailableQuestion: string;
  incompleteStep: string;
  checkpointSaveFailed: string;
  checkpointStepSaveFailed: string;
  stepResolutionFailed: string;
  submissionFailed: string;
  trustedFormCertFailed: string;
};

export type FormUiPageCopy = {
  nativeSubmissionError: {
    title: string;
    heading: string;
    fallbackMessage: string;
  };
};

export type FormUiCopy = {
  actions: FormUiActionCopy;
  progress: FormUiProgressCopy;
  errorModal: FormUiErrorModalCopy;
  errors: FormUiErrorCopy;
  pages: FormUiPageCopy;
};

export type InstantForm = {
  name: string;
  status: FormStatus;
  locale: string;
  ui: FormUiCopy;
  contract: FormContract;
  context: Readonly<Record<string, string>>;
  customVariables: Readonly<Record<string, string>>;
  payload: FormPayloadDelivery;
  page: FormPage;
  postSubmit: FormPostSubmit;
  attribution?: FormAttribution;
  tracking?: FormTracking;
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

export type FormPayloadSubmissionContext = {
  id: string;
  submittedAt: string;
};

export type FormPayloadCookieHelpers = {
  get: (name: string) => string | undefined;
};

export type FormPayloadRequestContext = {
  url: string;
  ip?: string;
  userAgent?: string;
};

export type FormPayloadBrowserContext = {
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  eventSourceUrl?: string;
};

export type FormPayloadDelivery<TContract extends FormContract = FormContract> = {
  url: string;
  method: "POST";
  encoding: "json" | "form_urlencoded";
  mapping: (input: {
    context: ContractContext<TContract>;
    answers: ContractAnswers<TContract>;
    submission: FormPayloadSubmissionContext;
    cookies: FormPayloadCookieHelpers;
    request: FormPayloadRequestContext;
    browser: FormPayloadBrowserContext;
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
  presentation?: StepPresentation;
  tracking?: StepTracking;
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

export type InterstitialStepDynamicInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = Omit<InterstitialStepInput<TKey, TShowWhen>, "benefits"> & {
  benefits?: readonly string[];
};

export type TrustedFormConsentStepInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
  TReviewTitle extends PlainTextValue = PlainTextValue,
  TReviewDescription extends DisplayCopy | undefined = DisplayCopy | undefined,
  TReviewFields extends readonly TrustedFormReviewField[] = readonly TrustedFormReviewField[],
  TConsentTitle extends PlainTextValue = PlainTextValue,
  TConsentDescription extends DisplayCopy | undefined = DisplayCopy | undefined,
  TDisclosure extends ConsentDisclosureCopy = ConsentDisclosureCopy,
> = {
  key: TKey;
  slug: string;
  countsAsStep?: boolean;
  presentation?: StepPresentation;
  tracking?: StepTracking;
  showWhen?: TShowWhen;
  review: TrustedFormReviewInput<TReviewTitle, TReviewDescription, TReviewFields>;
  consent: TrustedFormConsentCopyInput<TConsentTitle, TConsentDescription, TDisclosure>;
  substeps?: TrustedFormConsentSubstepsPresentation;
  acceptedAnswer?: "accepted";
  trustedForm?: Partial<TrustedFormConsentConfig>;
};

export type TrustedFormConsentStepDynamicInput<
  TKey extends string = string,
  TShowWhen extends StepCondition | undefined = StepCondition | undefined,
> = {
  key: TKey;
  slug: string;
  countsAsStep?: boolean;
  presentation?: StepPresentation;
  tracking?: StepTracking;
  showWhen?: TShowWhen;
  substeps?: TrustedFormConsentSubstepsPresentation;
  acceptedAnswer?: "accepted";
  trustedForm?: Partial<TrustedFormConsentConfig>;
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
export type DynamicResolverDependencyKey<TValue> = TValue extends DynamicResolverContext<infer TDependency, unknown>
  ? TDependency
  : never;
export type StepDynamicResolverDependencyKey<TStep> = TStep extends { dynamic?: infer TDynamic }
  ? DynamicResolverDependencyKey<NonNullable<TDynamic>>
  : never;
export type UnknownDynamicResolverDependencyKeys<
  TContract extends FormContract,
  TSteps extends readonly FormStep[],
> = Exclude<StepDynamicResolverDependencyKey<TSteps[number]>, ContractAnswerKey<TContract>>;
export type ForwardDynamicResolverDependencyKeys<
  TSteps extends readonly FormStep[],
  TSeenAnswerKeys extends string = never,
> = TSteps extends readonly [infer THead, ...infer TTail]
  ? THead extends FormStep
    ?
        | Exclude<StepDynamicResolverDependencyKey<THead>, TSeenAnswerKeys>
        | ForwardDynamicResolverDependencyKeys<
            TTail extends readonly FormStep[] ? TTail : readonly [],
            TSeenAnswerKeys | AnswerStepKey<THead>
          >
    : ForwardDynamicResolverDependencyKeys<TTail extends readonly FormStep[] ? TTail : readonly [], TSeenAnswerKeys>
  : never;
export type PriorAnswerStepKeys<TSteps extends readonly FormStep[], TSeenAnswerKeys extends string = never> =
  TSteps extends readonly [infer THead, ...infer TTail]
    ? THead extends FormStep
      ?
          | Exclude<StepShowWhenQuestionKey<THead>, TSeenAnswerKeys>
          | PriorAnswerStepKeys<
              TTail extends readonly FormStep[] ? TTail : readonly [],
              TSeenAnswerKeys | AnswerStepKey<THead>
            >
      : PriorAnswerStepKeys<TTail extends readonly FormStep[] ? TTail : readonly [], TSeenAnswerKeys>
    : never;
export type StepShowWhenQuestionKey<TStep> = StepShowWhenCondition<TStep> extends StepCondition<
  infer TQuestionKey,
  string
>
  ? NarrowString<TQuestionKey>
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
    : { readonly __invalidShowWhenAnswers: InvalidShowWhenAnswers<TContract, TSteps> }) &
  (PriorAnswerStepKeys<TSteps> extends never
    ? unknown
    : { readonly __forwardShowWhenQuestionKeys: PriorAnswerStepKeys<TSteps> }) &
  (UnknownDynamicResolverDependencyKeys<TContract, TSteps> extends never
    ? unknown
    : { readonly __unknownDynamicResolverDependencyKeys: UnknownDynamicResolverDependencyKeys<TContract, TSteps> }) &
  (ForwardDynamicResolverDependencyKeys<TSteps> extends never
    ? unknown
    : { readonly __forwardDynamicResolverDependencyKeys: ForwardDynamicResolverDependencyKeys<TSteps> });

export type FormFlowDefinitionBase<TContract extends FormContract = FormContract> = {
  name: string;
  status: FormStatus;
  locale: string;
  ui: FormUiCopy;
  contract: TContract;
  context: Readonly<Partial<ContractContextInput<TContract>>>;
  payload: FormPayloadDelivery<TContract>;
  page: FormPage;
  postSubmit: FormPostSubmit;
  attribution?: FormAttribution;
  tracking?: FormTracking<TContract> | ((helpers: TrackingAuthoringHelpers<TContract>) => FormTracking<TContract>);
};

export type TrackingEventAuthoringHelpers<TContract extends FormContract> = {
  readonly formView: (
    input: TrackingEventInput<"formView", ContractSchemaKeys<TContract["context"]>, TContract>,
  ) => TrackingEventConfig<"formView", ContractSchemaKeys<TContract["context"]>, TContract>;
  readonly stepView: (
    input: TrackingEventInput<"stepView", ContractSchemaKeys<TContract["context"]>, TContract>,
  ) => TrackingEventConfig<"stepView", ContractSchemaKeys<TContract["context"]>, TContract>;
  readonly stepAnswer: (
    input: TrackingEventInput<"stepAnswer", ContractSchemaKeys<TContract["context"]>, TContract>,
  ) => TrackingEventConfig<"stepAnswer", ContractSchemaKeys<TContract["context"]>, TContract>;
  readonly validationError: (
    input: TrackingEventInput<"validationError", ContractSchemaKeys<TContract["context"]>, TContract>,
  ) => TrackingEventConfig<"validationError", ContractSchemaKeys<TContract["context"]>, TContract>;
  readonly trustedFormSubstepView: (
    input: TrackingEventInput<"trustedFormSubstepView", ContractSchemaKeys<TContract["context"]>, TContract>,
  ) => TrackingEventConfig<"trustedFormSubstepView", ContractSchemaKeys<TContract["context"]>, TContract>;
  readonly submitAttempt: (
    input: TrackingEventInput<"submitAttempt", ContractSchemaKeys<TContract["context"]>, TContract>,
  ) => TrackingEventConfig<"submitAttempt", ContractSchemaKeys<TContract["context"]>, TContract>;
  readonly submitSuccess: (
    input: TrackingEventInput<"submitSuccess", ContractSchemaKeys<TContract["context"]>, TContract>,
  ) => TrackingEventConfig<"submitSuccess", ContractSchemaKeys<TContract["context"]>, TContract>;
  readonly submitError: (
    input: TrackingEventInput<"submitError", ContractSchemaKeys<TContract["context"]>, TContract>,
  ) => TrackingEventConfig<"submitError", ContractSchemaKeys<TContract["context"]>, TContract>;
};

export type TrackingAuthoringHelpers<TContract extends FormContract> = {
  readonly event: TrackingEventAuthoringHelpers<TContract>;
};

export type FormFlowInput<
  TContract extends FormContract = FormContract,
  TSteps extends readonly FormStep[] = readonly FormStep[],
> = FormFlowDefinitionBase<TContract> & {
  steps: TSteps;
} & EnforceAnswerStepKeys<TContract, TSteps>;
