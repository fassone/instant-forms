import { US_STATES, normalizeUsState } from "../../../shared/data/us-states";
import type {
  AutocompleteSourceDefinition,
  AutocompleteStep,
  BaseStep,
  CheckpointMode,
  ChoiceScrollHint,
  ChoiceOptionInput,
  ChoiceStep,
  ContractAnswerKey,
  ContractAnswers,
  ContractContext,
  DynamicResolverContext,
  FormContract,
  InterstitialStepDynamicBody,
  ConsentMarkdownPart,
  ConsentMarkdownValue,
  MarkdownPart,
  MarkdownValue,
  InterstitialStep,
  PhoneStep,
  PhoneDisplayInput,
  StateDisplayInput,
  StepBehavior,
  StepCondition,
  StepPresentation,
  StepTracking,
  StepTemplateKey,
  TextStep,
  TextPart,
  TextValue,
  TrustedFormConsentInlineTagRole,
  TrustedFormConsentTagToken,
  TrustedFormTagTextPart,
  TrustedFormReviewField,
  TrustedFormConsentStepDynamicBody,
  TrustedFormConsentStep,
  TrustedFormConsentStepInput,
} from "./types";
import { encodeTrustedFormConsentTag } from "./consent-markdown";

type RawStepCondition = {
  questionKey: string;
  answer: string;
};
type RawBaseStepInput = {
  key: string;
  slug: string;
  label: string;
  countsAsStep?: boolean;
  presentation?: StepPresentation;
  tracking?: StepTracking;
  showWhen?: RawStepCondition;
};
type RawChoiceStepInput = RawBaseStepInput & {
  options: readonly ChoiceOptionInput[];
  scrollHint?: ChoiceScrollHint;
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
type RawInterstitialStepDynamicInput = Omit<RawInterstitialStepInput, "benefits"> & {
  benefits?: readonly string[];
};
type RawTrustedFormConsentStepInput = {
  key: string;
  slug: string;
  countsAsStep?: boolean;
  presentation?: StepPresentation;
  showWhen?: RawStepCondition;
  review: TrustedFormConsentStepInput["review"];
  consent: TrustedFormConsentStepInput["consent"];
  substeps?: TrustedFormConsentStepInput["substeps"];
  acceptedAnswer?: "accepted";
  trustedForm?: TrustedFormConsentStepInput["trustedForm"];
};
type RawTrustedFormConsentStepDynamicInput = {
  key: string;
  slug: string;
  countsAsStep?: boolean;
  presentation?: StepPresentation;
  showWhen?: RawStepCondition;
  substeps?: TrustedFormConsentStepInput["substeps"];
  acceptedAnswer?: "accepted";
  trustedForm?: TrustedFormConsentStepInput["trustedForm"];
};
type RemovedTrustedFormConsentInputKeys = {
  label?: never;
  confirmation?: never;
  disclosure?: never;
  checkboxLabel?: never;
  submitLabel?: never;
  validationMessage?: never;
  grantorSummary?: never;
};
type RejectRemovedTrustedFormConsentInputKeys<TInput> = {
  [TKey in Extract<keyof TInput, keyof RemovedTrustedFormConsentInputKeys>]: never;
};

type InputShowWhen<TInput> = TInput extends { readonly showWhen: infer TShowWhen }
  ? Extract<TShowWhen, StepCondition>
  : undefined;
type ChoiceOptionKey<TOptions extends readonly ChoiceOptionInput[]> = TOptions[number]["key"];
type InputReviewTitle<TInput> = TInput extends { readonly review: { readonly title: infer TReviewTitle } }
  ? Extract<TReviewTitle, TrustedFormConsentStepInput["review"]["title"]>
  : never;
type InputReviewDescription<TInput> = TInput extends { readonly review: { readonly description: infer TReviewDescription } }
  ? Extract<TReviewDescription, NonNullable<TrustedFormConsentStepInput["review"]["description"]>>
  : undefined;
type InputReviewFields<TInput> = TInput extends {
  readonly review: { readonly fields: infer TReviewFields };
}
  ? Extract<TReviewFields, readonly TrustedFormReviewField[]>
  : never;
type InputConsentTitle<TInput> = TInput extends { readonly consent: { readonly title: infer TConsentTitle } }
  ? Extract<TConsentTitle, TrustedFormConsentStepInput["consent"]["title"]>
  : never;
type InputConsentDescription<TInput> = TInput extends { readonly consent: { readonly description: infer TConsentDescription } }
  ? Extract<TConsentDescription, NonNullable<TrustedFormConsentStepInput["consent"]["description"]>>
  : undefined;
type InputDisclosure<TInput> = TInput extends { readonly consent: { readonly disclosure: infer TDisclosure } }
  ? Extract<TDisclosure, TrustedFormConsentStepInput["consent"]["disclosure"]>
  : never;
type ResolverAnswerValue<TContract extends FormContract, TKey extends ContractAnswerKey<TContract>> = Extract<
  ContractAnswers<TContract>[TKey],
  string | undefined | null
>;
type ResolverAnswerMap<
  TContract extends FormContract,
  TDependencies extends readonly ContractAnswerKey<TContract>[],
> = Readonly<{
  [TKey in TDependencies[number]]: ResolverAnswerValue<TContract, TKey>;
}>;

type ExactResolverResult<TActual, TExpected> = TActual & {
  readonly [TKey in Exclude<keyof TActual, keyof TExpected>]: never;
};

type ExactTrustedFormConsentStepDynamicBody<TActual extends TrustedFormConsentStepDynamicBody> = ExactResolverResult<
  TActual,
  TrustedFormConsentStepDynamicBody
> & {
  review: ExactResolverResult<TActual["review"], TrustedFormConsentStepDynamicBody["review"]>;
  consent: ExactResolverResult<TActual["consent"], TrustedFormConsentStepDynamicBody["consent"]>;
};

type ScopedResolver<
  TContract extends FormContract,
  TDependencies extends readonly ContractAnswerKey<TContract>[],
  TResult,
> = (input: {
  context: Readonly<ContractContext<TContract>>;
  answers: ResolverAnswerMap<TContract, TDependencies>;
}) => TResult;

type RawResolver<TDependencies extends readonly string[], TResult> = (input: {
  context: Readonly<Record<string, string | undefined>>;
  answers: Readonly<Record<TDependencies[number], string>>;
}) => TResult;

export type FlowStepBuilders<TContract extends FormContract> = Omit<
  typeof step,
  "interstitial" | "trustedFormConsent"
> & {
  readonly interstitial: {
    <const TInput extends RawInterstitialStepInput>(
      input: TInput,
    ): InterstitialStep<TInput["key"], InputShowWhen<TInput>, undefined>;
    <
      const TInput extends RawInterstitialStepDynamicInput,
      const TDependencies extends readonly ContractAnswerKey<TContract>[],
      const TBody extends InterstitialStepDynamicBody,
    >(
      input: TInput,
      dependencies: TDependencies,
      resolver: ScopedResolver<TContract, TDependencies, ExactResolverResult<TBody, InterstitialStepDynamicBody>>,
    ): InterstitialStep<
      TInput["key"],
      InputShowWhen<TInput>,
      DynamicResolverContext<TDependencies[number], InterstitialStepDynamicBody>
    >;
  };
  readonly trustedFormConsent: {
    <const TInput extends RawTrustedFormConsentStepInput>(
      input: TInput & RejectRemovedTrustedFormConsentInputKeys<TInput>,
    ): TrustedFormConsentStep<
      TInput["key"],
      InputShowWhen<TInput>,
      InputReviewTitle<TInput>,
      InputReviewDescription<TInput>,
      InputReviewFields<TInput>,
      InputConsentTitle<TInput>,
      InputConsentDescription<TInput>,
      InputDisclosure<TInput>,
      undefined
    >;
    <
      const TInput extends RawTrustedFormConsentStepDynamicInput,
      const TDependencies extends readonly ContractAnswerKey<TContract>[],
      const TBody extends TrustedFormConsentStepDynamicBody,
    >(
      input: TInput & RejectRemovedTrustedFormConsentInputKeys<TInput>,
      dependencies: TDependencies,
      resolver: ScopedResolver<TContract, TDependencies, ExactTrustedFormConsentStepDynamicBody<TBody>>,
    ): TrustedFormConsentStep<
      TInput["key"],
      InputShowWhen<TInput>,
      "",
      undefined,
      [],
      "",
      undefined,
      ConsentMarkdownValue,
      DynamicResolverContext<TDependencies[number], TrustedFormConsentStepDynamicBody>
    >;
  };
};

export type FlowAuthoringHelpers<TContract extends FormContract> = {
  readonly step: FlowStepBuilders<TContract>;
  readonly resolve: <const TDependencies extends readonly ContractAnswerKey<TContract>[], TResult>(
    dependencies: TDependencies,
    resolver: (input: {
      context: Readonly<ContractContext<TContract>>;
      answers: ResolverAnswerMap<TContract, TDependencies>;
    }) => TResult,
  ) => DynamicResolverContext<TDependencies[number], TResult>;
  readonly text: typeof text;
  readonly md: typeof md;
  readonly markdown: typeof markdown;
  readonly phoneDisplay: typeof phoneDisplay;
  readonly stateDisplay: typeof stateDisplay;
  readonly consentMd: typeof consentMd;
  readonly tfTag: typeof tfTag;
};

export const autocompleteSource = {
  usStates(): AutocompleteSourceDefinition {
    return {
      key: "us_states",
      clientKey: "usStates",
      normalize: normalizeUsState,
      validationMessage: "",
    };
  },
} as const;

export function text<const TParts extends readonly TextPart[]>(...parts: TParts): TextValue {
  return parts.join("") as TextValue;
}

export function md<const TParts extends readonly MarkdownPart[]>(...parts: TParts): MarkdownValue {
  return parts.join("") as MarkdownValue;
}

export const markdown = md;

export function phoneDisplay(value: PhoneDisplayInput): TextValue {
  return formatUsPhoneDisplay(value) as TextValue;
}

export function stateDisplay(value: StateDisplayInput): TextValue {
  return formatUsStateDisplay(value) as TextValue;
}

export function tfTag<
  const TRole extends TrustedFormConsentInlineTagRole,
  const TParts extends readonly TrustedFormTagTextPart[],
>(role: TRole, ...parts: TParts): TrustedFormConsentTagToken {
  return encodeTrustedFormConsentTag(role, parts.join("")) as TrustedFormConsentTagToken;
}

export function consentMd<const TParts extends readonly ConsentMarkdownPart[]>(...parts: TParts): ConsentMarkdownValue {
  return parts.join("") as ConsentMarkdownValue;
}

export function resolve<const TDependencies extends readonly string[], TResult>(
  dependencies: TDependencies,
  resolver: (input: {
    context: Readonly<Record<string, string | undefined>>;
    answers: Readonly<Record<TDependencies[number], string>>;
  }) => TResult,
): DynamicResolverContext<TDependencies[number], TResult> {
  return {
    __kind: "dynamic_resolver",
    dependencies,
    resolve: resolver,
  };
}

export function createFlowAuthoringHelpers<TContract extends FormContract>(
  _contract: TContract,
): FlowAuthoringHelpers<TContract> {
  return {
    step: step as unknown as FlowStepBuilders<TContract>,
    resolve: resolve as unknown as FlowAuthoringHelpers<TContract>["resolve"],
    text,
    md,
    markdown,
    phoneDisplay,
    stateDisplay,
    consentMd,
    tfTag,
  };
}

function createInterstitialStep<const TInput extends RawInterstitialStepInput>(
  input: TInput,
): InterstitialStep<TInput["key"], InputShowWhen<TInput>, undefined>;
function createInterstitialStep<
  const TInput extends RawInterstitialStepDynamicInput,
  const TDependencies extends readonly string[],
  const TBody extends InterstitialStepDynamicBody,
>(
  input: TInput,
  dependencies: TDependencies,
  resolver: RawResolver<TDependencies, ExactResolverResult<TBody, InterstitialStepDynamicBody>>,
): InterstitialStep<
  TInput["key"],
  InputShowWhen<TInput>,
  DynamicResolverContext<TDependencies[number], InterstitialStepDynamicBody>
>;
function createInterstitialStep(
  input: RawInterstitialStepInput | RawInterstitialStepDynamicInput,
  dependencies?: readonly string[],
  resolver?: (input: {
    context: Readonly<Record<string, string | undefined>>;
    answers: Readonly<Record<string, string>>;
  }) => InterstitialStepDynamicBody,
): InterstitialStep<string, StepCondition | undefined> {
  const dynamic = dependencies && resolver ? resolve(dependencies, resolver) : undefined;

  return {
    ...baseStep(input, "interstitial", "checkpoint_only", { interstitialTiming: "matching_offer" }),
    kind: "interstitial",
    type: "INTERSTITIAL",
    loadingLabel: input.loadingLabel ?? "",
    successLines: input.successLines,
    completionAnswer: input.completionAnswer ?? "completed",
    seenAnswer: input.seenAnswer ?? "seen",
    benefits: input.benefits ?? [],
    ...(dynamic ? { dynamic } : {}),
  };
}

function createTrustedFormConsentStep<const TInput extends RawTrustedFormConsentStepInput>(
  input: TInput & RejectRemovedTrustedFormConsentInputKeys<TInput>,
): TrustedFormConsentStep<
  TInput["key"],
  InputShowWhen<TInput>,
  InputReviewTitle<TInput>,
  InputReviewDescription<TInput>,
  InputReviewFields<TInput>,
  InputConsentTitle<TInput>,
  InputConsentDescription<TInput>,
  InputDisclosure<TInput>,
  undefined
>;
function createTrustedFormConsentStep<
  const TInput extends RawTrustedFormConsentStepDynamicInput,
  const TDependencies extends readonly string[],
  const TBody extends TrustedFormConsentStepDynamicBody,
>(
  input: TInput & RejectRemovedTrustedFormConsentInputKeys<TInput>,
  dependencies: TDependencies,
  resolver: RawResolver<TDependencies, ExactTrustedFormConsentStepDynamicBody<TBody>>,
): TrustedFormConsentStep<
  TInput["key"],
  InputShowWhen<TInput>,
  "",
  undefined,
  [],
  "",
  undefined,
  ConsentMarkdownValue,
  DynamicResolverContext<TDependencies[number], TrustedFormConsentStepDynamicBody>
>;
function createTrustedFormConsentStep(
  input:
    | (RawTrustedFormConsentStepInput & RemovedTrustedFormConsentInputKeys)
    | (RawTrustedFormConsentStepDynamicInput & RemovedTrustedFormConsentInputKeys),
  dependencies?: readonly string[],
  resolver?: (input: {
    context: Readonly<Record<string, string | undefined>>;
    answers: Readonly<Record<string, string>>;
  }) => TrustedFormConsentStepDynamicBody,
): TrustedFormConsentStep<string, StepCondition | undefined> {
  const dynamic = dependencies && resolver ? resolve(dependencies, resolver) : undefined;
  const staticInput = input as Partial<RawTrustedFormConsentStepInput> & RawTrustedFormConsentStepDynamicInput;
  const reviewInput = staticInput.review;
  const consentInput = staticInput.consent;
  const review: TrustedFormConsentStepInput["review"] = {
    title: reviewInput && "title" in reviewInput ? reviewInput.title : "",
    ...(reviewInput && "description" in reviewInput && reviewInput.description ? { description: reviewInput.description } : {}),
    nextLabel: reviewInput && "nextLabel" in reviewInput && reviewInput.nextLabel ? reviewInput.nextLabel : "",
    fields: reviewInput && "fields" in reviewInput && reviewInput.fields ? reviewInput.fields : [],
  };
  const consent: TrustedFormConsentStepInput["consent"] = {
    title: consentInput && "title" in consentInput ? consentInput.title : "",
    ...(consentInput && "description" in consentInput && consentInput.description ? { description: consentInput.description } : {}),
    disclosure: consentInput && "disclosure" in consentInput ? consentInput.disclosure : consentMd(""),
    checkboxLabel:
      consentInput && "checkboxLabel" in consentInput && consentInput.checkboxLabel
        ? consentInput.checkboxLabel
        : "",
    submitLabel: consentInput && "submitLabel" in consentInput && consentInput.submitLabel ? consentInput.submitLabel : "",
    validationMessage:
      consentInput && "validationMessage" in consentInput && consentInput.validationMessage
        ? consentInput.validationMessage
        : "",
  };
  const label = getStaticDisplayCopyLabel(review.title) ?? staticInput.key;

  return {
    ...baseStep({ ...staticInput, label }, "trusted_form_consent", "checkpoint_only", { trustedForm: "certify" }),
    kind: "trusted_form_consent",
    type: "TRUSTED_FORM_CONSENT",
    review: {
      title: review.title,
      ...(review.description ? { description: review.description } : {}),
      nextLabel: review.nextLabel ?? "",
      fields: review.fields,
    },
    consent: {
      title: consent.title,
      ...(consent.description ? { description: consent.description } : {}),
      disclosure: consent.disclosure,
      checkboxLabel: consent.checkboxLabel ?? "",
      submitLabel: consent.submitLabel ?? "",
      validationMessage: consent.validationMessage ?? "",
    },
    ...(staticInput.substeps ? { substeps: staticInput.substeps } : {}),
    acceptedAnswer: staticInput.acceptedAnswer ?? "accepted",
    trustedForm: buildTrustedFormConsentConfig(staticInput.trustedForm),
    ...(dynamic ? { dynamic } : {}),
  };
}

export const step = {
  choice<const TInput extends RawChoiceStepInput>(
    input: TInput,
  ): ChoiceStep<TInput["key"], ChoiceOptionKey<TInput["options"]>, InputShowWhen<TInput>> {
    return {
      ...baseStep(input, "choice", "answer", { autoAdvance: true }),
      kind: "choice",
      type: "CUSTOM",
      options: input.options.map((option) => ({ key: option.key, value: option.label })),
      ...(input.scrollHint ? { scrollHint: input.scrollHint } : {}),
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

  interstitial: createInterstitialStep,

  trustedFormConsent: createTrustedFormConsentStep,
} as const;

function buildTrustedFormConsentConfig(
  input: RawTrustedFormConsentStepInput["trustedForm"] | undefined,
): TrustedFormConsentStep["trustedForm"] {
  return {
    fieldName: input?.fieldName ?? "xxTrustedFormCertUrl",
    delivery: input?.delivery ?? "main_thread",
    scriptProxyKey: input?.scriptProxyKey,
    scriptBaseUrl:
      input?.scriptBaseUrl ??
      (input?.scriptProxyKey ? `/_instant/scripts/${input.scriptProxyKey}.js` : "https://api.trustedform.com/trustedform.js"),
    partytownLib: input?.partytownLib ?? "/~partytown/",
    partytownScriptUrl: input?.partytownScriptUrl ?? "/~partytown/partytown.js",
    useTaggedConsent: input?.useTaggedConsent ?? true,
    sandbox: input?.sandbox ?? false,
    preloadAssets: input?.preloadAssets ?? "when_reachable",
    execute: input?.execute ?? "on_step_mount",
    requireReadyBefore: input?.requireReadyBefore ?? "consent_substep",
    allowSubmitWithoutCert: input?.allowSubmitWithoutCert ?? true,
  };
}

function getStaticDisplayCopyLabel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || undefined;
}

function formatUsPhoneDisplay(value: string): string {
  const trimmedValue = value.trim();
  const digitsOnly = trimmedValue.replace(/\D/g, "");
  const nationalDigits =
    digitsOnly.length === 11 && digitsOnly.startsWith("1")
      ? digitsOnly.slice(1)
      : digitsOnly.length === 10
        ? digitsOnly
        : undefined;

  if (!nationalDigits) {
    return value;
  }

  return `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3, 6)}-${nationalDigits.slice(6)}`;
}

function formatUsStateDisplay(value: string): string {
  const stateCode = normalizeUsState(value);
  const state = stateCode ? US_STATES.find((candidate) => candidate.code === stateCode) : undefined;
  return state?.name ?? value;
}

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
    ...(input.presentation ? { presentation: input.presentation } : {}),
    ...(input.tracking ? { tracking: input.tracking } : {}),
    showWhen: input.showWhen as InputShowWhen<TInput>,
  };
}
