import type {
  AnswerStep,
  EnforceAnswerStepKeys,
  FormContract,
  FormFlowDefinitionBase,
  FormFlowInput,
  FormAttribution,
  FormPage,
  FormPostSubmit,
  FormStep,
  FormTracking,
  FormPayloadDelivery,
  FormUiCopy,
  InstantForm,
  StepPresentation,
} from "./types";
import { getStepDynamicResolverDependencies } from "./dynamic-resolvers";
import { createFlowAuthoringHelpers, type FlowAuthoringHelpers } from "./step-builders";
import { createTrackingAuthoringHelpers } from "./tracking-builders";

type AnswerSchema = Record<string, unknown> & {
  safeParse: (input: unknown) => { success: boolean };
};

type FormFlowCallbackInput<
  TContract extends FormContract,
  TSteps extends readonly FormStep[],
> = FormFlowDefinitionBase<TContract> & {
  steps: (helpers: FlowAuthoringHelpers<TContract>) => TSteps & EnforceAnswerStepKeys<TContract, TSteps>;
};

export function defineFormFlow<
  const TContract extends FormContract,
  const TSteps extends readonly FormStep[],
>(input: FormFlowInput<TContract, TSteps>): InstantForm;

export function defineFormFlow<
  const TContract extends FormContract,
  const TSteps extends readonly FormStep[],
>(input: FormFlowCallbackInput<TContract, TSteps>): InstantForm;

export function defineFormFlow<const TContract extends FormContract, const TSteps extends readonly FormStep[]>(
  input: FormFlowInput<TContract, TSteps> | FormFlowCallbackInput<TContract, TSteps>,
): InstantForm {
  const context = parsePartialObject(input.contract.context, input.context, "context");
  const steps =
    typeof input.steps === "function"
      ? input.steps(createFlowAuthoringHelpers(input.contract))
      : input.steps;
  const tracking =
    typeof input.tracking === "function" ? input.tracking(createTrackingAuthoringHelpers()) : input.tracking;
  assertAnswerStepContract(input.contract, steps);
  assertUiCopy(input.ui);
  assertPayloadDelivery(input.payload);
  assertPage(input.page);
  assertPostSubmit(input.postSubmit, steps);
  assertAttribution(input.attribution);
  assertTrackingContract(input.contract, tracking);
  assertKnownTemplateVariables(input.contract, { name: input.name, page: input.page, steps });

  return {
    name: input.name,
    status: input.status,
    locale: input.locale,
    ui: input.ui,
    contract: input.contract,
    context,
    customVariables: context,
    payload: input.payload,
    page: input.page,
    postSubmit: input.postSubmit,
    ...(input.attribution ? { attribution: input.attribution } : {}),
    ...(tracking ? { tracking } : {}),
    steps,
  };
}

function parsePartialObject(
  schema: FormContract["context"],
  input: Readonly<Record<string, unknown>>,
  context: string,
): Readonly<Record<string, string>> {
  assertKnownKeys(schema, input, context);
  const normalizedInput = normalizeVariableInput(input);
  const validation = schema.safeParse(normalizedInput);

  if (!validation.success) {
    throw new Error(`${context} does not match the context contract: ${validation.error.message}`);
  }

  return stringifyVariableMap(validation.data, context);
}

function assertAnswerStepContract(
  contract: FormContract,
  steps: readonly FormStep[],
): void {
  const expectedAnswerKeys = new Set(getSchemaKeys(contract.answers));
  const seenAnswerKeys = new Set<string>();

  for (const stepDefinition of steps) {
    assertStepPresentation(stepDefinition);
    assertShowWhenContract(contract, stepDefinition, seenAnswerKeys);
    assertDynamicResolverDependencies(contract, stepDefinition, seenAnswerKeys);
    assertStepTrackingContract(contract, stepDefinition);

    if (!isAnswerStep(stepDefinition)) {
      continue;
    }

    if (!expectedAnswerKeys.has(stepDefinition.key)) {
      throw new Error(`Answer step key "${stepDefinition.key}" is not declared in contract.answers.`);
    }

    if (seenAnswerKeys.has(stepDefinition.key)) {
      throw new Error(`Answer step key "${stepDefinition.key}" is provided more than once.`);
    }

    seenAnswerKeys.add(stepDefinition.key);

    if (stepDefinition.kind === "choice") {
      assertChoiceOptionContract(contract, stepDefinition);
      assertChoiceScrollHint(stepDefinition);
    }
  }

  const missingAnswerKeys = [...expectedAnswerKeys].filter((key) => !seenAnswerKeys.has(key));

  if (missingAnswerKeys.length > 0) {
    throw new Error(`contract.answers includes keys without answer-producing steps: ${missingAnswerKeys.join(", ")}.`);
  }
}

function assertDynamicResolverDependencies(
  contract: FormContract,
  stepDefinition: FormStep,
  previousAnswerKeys: ReadonlySet<string>,
): void {
  for (const dependencyKey of getStepDynamicResolverDependencies(stepDefinition)) {
    if (!getAnswerSchema(contract, dependencyKey)) {
      throw new Error(
        `Resolver for step "${stepDefinition.key}" references unknown contract.answers key "${dependencyKey}".`,
      );
    }

    if (!previousAnswerKeys.has(dependencyKey)) {
      throw new Error(
        `Resolver for step "${stepDefinition.key}" references "${dependencyKey}" before that answer is available.`,
      );
    }
  }
}

function assertChoiceOptionContract(contract: FormContract, stepDefinition: FormStep): void {
  if (stepDefinition.kind !== "choice") {
    return;
  }

  const answerSchema = getAnswerSchema(contract, stepDefinition.key);

  if (!answerSchema) {
    return;
  }

  const invalidOptionKeys = stepDefinition.options
    .map((option) => option.key)
    .filter((optionKey) => !answerSchema.safeParse(optionKey).success);

  if (invalidOptionKeys.length > 0) {
    throw new Error(
      `Choice step "${stepDefinition.key}" includes option keys outside contract.answers: ${invalidOptionKeys.join(", ")}.`,
    );
  }

  const expectedOptionKeys = getStringEnumOptions(answerSchema);

  if (!expectedOptionKeys) {
    return;
  }

  const actualOptionKeys = new Set(stepDefinition.options.map((option) => option.key));
  const missingOptionKeys = expectedOptionKeys.filter((optionKey) => !actualOptionKeys.has(optionKey));

  if (missingOptionKeys.length > 0) {
    throw new Error(
      `Choice step "${stepDefinition.key}" is missing option keys from contract.answers: ${missingOptionKeys.join(", ")}.`,
    );
  }
}

function assertShowWhenContract(
  contract: FormContract,
  stepDefinition: FormStep,
  previousAnswerKeys: ReadonlySet<string>,
): void {
  if (!stepDefinition.showWhen) {
    return;
  }

  const answerSchema = getAnswerSchema(contract, stepDefinition.showWhen.questionKey);

  if (!answerSchema) {
    throw new Error(
      `showWhen for step "${stepDefinition.key}" references unknown contract.answers key "${stepDefinition.showWhen.questionKey}".`,
    );
  }

  if (!previousAnswerKeys.has(stepDefinition.showWhen.questionKey)) {
    throw new Error(
      `showWhen for step "${stepDefinition.key}" references "${stepDefinition.showWhen.questionKey}" before that answer is available.`,
    );
  }

  if (!answerSchema.safeParse(stepDefinition.showWhen.answer).success) {
    throw new Error(
      `showWhen for step "${stepDefinition.key}" uses answer "${stepDefinition.showWhen.answer}" that does not match contract.answers.${stepDefinition.showWhen.questionKey}.`,
    );
  }
}

function assertKnownTemplateVariables(
  contract: FormContract,
  input: { name: string; page: FormPage; steps: readonly FormStep[] },
): void {
  const contextKeys = new Set(getSchemaKeys(contract.context));
  const templates = [
    input.name,
    input.page.name,
    input.page.meta?.description,
    input.page.meta?.robots,
    ...input.steps.flatMap((stepDefinition) => getStepTemplateStrings(stepDefinition)),
  ].filter((template): template is string => typeof template === "string");

  for (const template of templates) {
    for (const variableName of getTemplateVariableNames(template)) {
      if (!contextKeys.has(variableName)) {
        throw new Error(`Template variable "{{${variableName}}}" is not declared in contract.context.`);
      }
    }
  }
}

function assertPage(page: FormPage): void {
  assertPagePresentation(page);
  assertPageMeta(page);
}

function assertPagePresentation(page: FormPage): void {
  const desktopHeightPx = page.presentation?.desktopHeightPx;

  if (desktopHeightPx === undefined) {
    return;
  }

  if (typeof desktopHeightPx !== "number" || !Number.isFinite(desktopHeightPx) || desktopHeightPx <= 0) {
    throw new Error("page.presentation.desktopHeightPx must be a finite positive number.");
  }
}

function assertPageMeta(page: FormPage): void {
  if (page.meta?.description !== undefined && !isNonEmptyMarkupFreePlainText(page.meta.description)) {
    throw new Error("page.meta.description must be non-empty plain text when provided.");
  }

  if (page.meta?.robots !== undefined && !isNonEmptyMarkupFreePlainText(page.meta.robots)) {
    throw new Error("page.meta.robots must be non-empty plain text when provided.");
  }
}

function assertUiCopy(ui: FormUiCopy): void {
  if (!isNonEmptyPlainText(ui.scrollHints?.moreOptions)) {
    throw new Error("ui.scrollHints.moreOptions is required.");
  }

  if (!isNonEmptyPlainText(ui.scrollHints?.moreContent)) {
    throw new Error("ui.scrollHints.moreContent is required.");
  }
}

function assertChoiceScrollHint(stepDefinition: FormStep): void {
  if (stepDefinition.kind !== "choice" || !stepDefinition.scrollHint) {
    return;
  }

  if (!isNonEmptyPlainText(stepDefinition.scrollHint.label)) {
    throw new Error(`scrollHint.label for step "${stepDefinition.key}" is required when scrollHint is provided.`);
  }
}

function isNonEmptyPlainText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyMarkupFreePlainText(value: unknown): value is string {
  return isNonEmptyPlainText(value) && !/[<>]/u.test(value);
}

function assertStepPresentation(stepDefinition: FormStep): void {
  assertChoiceSizePresentation(stepDefinition.key, stepDefinition.presentation);

  if (stepDefinition.kind === "trusted_form_consent") {
    assertChoiceSizePresentation(`${stepDefinition.key}.substeps.review`, stepDefinition.substeps?.review?.presentation);
    assertChoiceSizePresentation(`${stepDefinition.key}.substeps.consent`, stepDefinition.substeps?.consent?.presentation);
  }
}

function assertChoiceSizePresentation(stepKey: string, presentation: StepPresentation | undefined): void {
  const choiceSize = presentation?.choiceSize;

  if (choiceSize === undefined) {
    return;
  }

  if (choiceSize !== "default" && choiceSize !== "compact" && choiceSize !== "spacious") {
    throw new Error(
      `presentation.choiceSize for step "${stepKey}" must be "default", "compact", or "spacious".`,
    );
  }
}

function assertPayloadDelivery(payload: FormPayloadDelivery): void {
  if (!isSafePayloadUrl(payload.url)) {
    throw new Error(
      'payload.url must be an absolute "https://" URL or a Railway private "http://*.railway.internal:<port>" URL.',
    );
  }
}

function assertPostSubmit(postSubmit: FormPostSubmit, steps: readonly FormStep[]): void {
  if (!postSubmit.title.trim()) {
    throw new Error("postSubmit.title is required.");
  }

  if (!postSubmit.message.trim()) {
    throw new Error("postSubmit.message is required.");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(postSubmit.slug)) {
    throw new Error("postSubmit.slug must be a lowercase URL-safe slug.");
  }

  if (new Set(["api", "_instant", "__preview"]).has(postSubmit.slug)) {
    throw new Error(`postSubmit.slug "${postSubmit.slug}" is reserved.`);
  }

  const stepSlugs = new Set(steps.flatMap((stepDefinition) => [
    stepDefinition.slug,
    stepDefinition.key.replaceAll("_", "-"),
  ]));

  if (stepSlugs.has(postSubmit.slug)) {
    throw new Error(`postSubmit.slug "${postSubmit.slug}" collides with a step slug.`);
  }

  if (!postSubmit.cta) {
    return;
  }

  if (!postSubmit.cta.label.trim()) {
    throw new Error("postSubmit.cta.label is required when postSubmit.cta is provided.");
  }

  if (!isSafePostSubmitCtaHref(postSubmit.cta.href)) {
    throw new Error('postSubmit.cta.href must be a relative "/" URL or an "https://" URL.');
  }

  assertPostSubmitCtaAppLink(postSubmit.cta.appLink);
}

function assertAttribution(attribution: FormAttribution | undefined): void {
  if (!attribution) {
    return;
  }

  const seenQueryParams = new Set<string>();
  for (const queryParam of attribution.preserveQueryParams) {
    if (!/^[A-Za-z0-9_.~-]+$/u.test(queryParam)) {
      throw new Error("attribution.preserveQueryParams values must be non-empty safe query parameter names.");
    }

    if (seenQueryParams.has(queryParam)) {
      throw new Error(`attribution.preserveQueryParams includes "${queryParam}" more than once.`);
    }

    seenQueryParams.add(queryParam);
  }
}

function isSafePostSubmitCtaHref(href: string): boolean {
  const trimmedHref = href.trim();

  return (
    (trimmedHref.startsWith("/") && !trimmedHref.startsWith("//")) ||
    trimmedHref.startsWith("https://")
  );
}

function assertPostSubmitCtaAppLink(appLink: NonNullable<FormPostSubmit["cta"]>["appLink"]): void {
  if (!appLink) {
    return;
  }

  if (appLink.ios === undefined && appLink.android === undefined) {
    throw new Error("postSubmit.cta.appLink must include ios or android when provided.");
  }

  if (appLink.ios !== undefined && !isSafeCustomSchemeUrl(appLink.ios)) {
    throw new Error("postSubmit.cta.appLink.ios must be a non-empty custom-scheme URL when provided.");
  }

  if (appLink.android !== undefined && !isSafeCustomSchemeUrl(appLink.android)) {
    throw new Error("postSubmit.cta.appLink.android must be a non-empty custom-scheme URL when provided.");
  }
}

function isSafeCustomSchemeUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || /[\s<>]/u.test(value)) {
    return false;
  }

  try {
    const parsedUrl = new URL(value);
    return (
      /^[a-z][a-z0-9+.-]*:$/iu.test(parsedUrl.protocol) &&
      !["http:", "https:", "javascript:", "data:", "vbscript:", "file:"].includes(parsedUrl.protocol.toLowerCase())
    );
  } catch {
    return false;
  }
}

function isSafePayloadUrl(url: string): boolean {
  if (typeof url !== "string" || !url.trim() || url !== url.trim()) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);

    if (isRailwayPrivateHostname(parsedUrl.hostname)) {
      return isSafeRailwayPrivatePayloadUrl(parsedUrl);
    }

    return parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeRailwayPrivatePayloadUrl(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    url.port !== "" &&
    isRailwayPrivateHostname(url.hostname) &&
    url.hostname !== "railway.internal"
  );
}

function isRailwayPrivateHostname(hostname: string): boolean {
  return hostname === "railway.internal" || hostname.endsWith(".railway.internal");
}

function assertTrackingContract(contract: FormContract, tracking: FormTracking | undefined): void {
  const visitorId = tracking?.visitorId;
  if (visitorId) {
    if (
      !Number.isInteger(visitorId.cookie.maxAgeSeconds) ||
      visitorId.cookie.maxAgeSeconds < 60 ||
      visitorId.cookie.maxAgeSeconds > 400 * 24 * 60 * 60
    ) {
      throw new Error("tracking.visitorId.cookie.maxAgeSeconds must be an integer between 60 and 34560000.");
    }
  }

  const googleTagManager = tracking?.googleTagManager;
  if (!tracking) {
    return;
  }

  if (googleTagManager) {
    if (!/^GTM-[A-Z0-9]+$/iu.test(googleTagManager.containerId)) {
      throw new Error("tracking.googleTagManager.containerId must be a valid GTM container ID.");
    }

    if (googleTagManager.delivery !== "partytown") {
      throw new Error('tracking.googleTagManager.delivery must be "partytown".');
    }

    if (googleTagManager.proxy !== "first_party") {
      throw new Error('tracking.googleTagManager.proxy must be "first_party".');
    }
  }

  const contextKeys = new Set(getSchemaKeys(contract.context));
  const seenEventKinds = new Set<string>();

  for (const eventConfig of tracking.events ?? []) {
    if (!eventConfig.name.trim()) {
      throw new Error(`tracking.events.${eventConfig.kind}.name is required.`);
    }

    if (seenEventKinds.has(eventConfig.kind)) {
      throw new Error(`tracking.events includes "${eventConfig.kind}" more than once.`);
    }
    seenEventKinds.add(eventConfig.kind);

    const unknownContextKeys = (eventConfig.includeContext ?? []).filter((key) => !contextKeys.has(key));
    if (unknownContextKeys.length > 0) {
      throw new Error(
        `tracking.events.${eventConfig.kind}.includeContext references unknown contract.context keys: ${unknownContextKeys.join(", ")}.`,
      );
    }

    if (
      eventConfig.meta &&
      eventConfig.kind !== "submitSuccess" &&
      eventConfig.kind !== "stepAnswer" &&
      eventConfig.kind !== "trustedFormSubstepView"
    ) {
      throw new Error(
        `tracking.events.${eventConfig.kind}.meta is only supported on submitSuccess, stepAnswer, and trustedFormSubstepView events.`,
      );
    }

    if (
      eventConfig.server &&
      eventConfig.kind !== "formView" &&
      eventConfig.kind !== "stepView" &&
      eventConfig.kind !== "submitSuccess" &&
      eventConfig.kind !== "stepAnswer" &&
      eventConfig.kind !== "trustedFormSubstepView"
    ) {
      throw new Error(
        `tracking.events.${eventConfig.kind}.server is only supported on formView, stepView, submitSuccess, stepAnswer, and trustedFormSubstepView events.`,
      );
    }
  }
}

function assertStepTrackingContract(contract: FormContract, stepDefinition: FormStep): void {
  if (!stepDefinition.tracking) {
    return;
  }

  const contextKeys = new Set(getSchemaKeys(contract.context));

  for (const [eventKind, override] of Object.entries(stepDefinition.tracking)) {
    if (override === false) {
      continue;
    }

    if (!override.name.trim()) {
      throw new Error(`tracking override for step "${stepDefinition.key}" event "${eventKind}" requires a name.`);
    }

    const unknownContextKeys = (override.includeContext ?? []).filter((key) => !contextKeys.has(key));
    if (unknownContextKeys.length > 0) {
      throw new Error(
        `tracking override for step "${stepDefinition.key}" event "${eventKind}" references unknown contract.context keys: ${unknownContextKeys.join(", ")}.`,
      );
    }
  }
}

function getStepTemplateStrings(stepDefinition: FormStep): string[] {
  const values = [stepDefinition.label];

  if (stepDefinition.kind === "choice") {
    values.push(...stepDefinition.options.map((option) => option.value));
    values.push(stepDefinition.scrollHint?.label ?? "");
  }

  if (stepDefinition.kind === "interstitial") {
    values.push(
      stepDefinition.loadingLabel,
      ...stepDefinition.benefits,
      ...stepDefinition.successLines.map((line) => line.text),
    );
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    values.push(
      ...getStaticDisplayCopyTemplateStrings(stepDefinition.review.title),
      ...getStaticDisplayCopyTemplateStrings(stepDefinition.review.description),
      stepDefinition.review.nextLabel,
      ...getStaticDisplayCopyTemplateStrings(stepDefinition.consent.title),
      ...getStaticDisplayCopyTemplateStrings(stepDefinition.consent.description),
      ...getStaticDisplayCopyTemplateStrings(stepDefinition.consent.disclosure),
      stepDefinition.consent.checkboxLabel,
      stepDefinition.consent.submitLabel,
    );
  }

  return values;
}

function getStaticDisplayCopyTemplateStrings(value: unknown): string[] {
  return typeof value === "string" ? [value] : [];
}

function getTemplateVariableNames(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((match) => match[1] ?? "");
}

function assertKnownKeys(schema: FormContract["context"] | FormContract["payload"], input: unknown, context: string): void {
  if (!isRecord(input)) {
    throw new Error(`${context} must be an object.`);
  }

  const knownKeys = new Set(getSchemaKeys(schema));
  const unknownKeys = Object.keys(input).filter((key) => !knownKeys.has(key));

  if (unknownKeys.length > 0) {
    throw new Error(`${context} includes undeclared keys: ${unknownKeys.join(", ")}.`);
  }
}

function getSchemaKeys(schema: FormContract["context"] | FormContract["answers"] | FormContract["payload"]): string[] {
  return Object.keys(schema.shape);
}

function getAnswerSchema(contract: FormContract, key: string): AnswerSchema | undefined {
  const schema = contract.answers.shape[key];

  if (!isRecord(schema) || typeof (schema as { safeParse?: unknown }).safeParse !== "function") {
    return undefined;
  }

  return schema as unknown as AnswerSchema;
}

function getStringEnumOptions(schema: unknown): string[] | undefined {
  const unwrappedSchema = unwrapSchema(schema);

  if (!isRecord(unwrappedSchema) || !Array.isArray(unwrappedSchema.options)) {
    return undefined;
  }

  const options = unwrappedSchema.options;

  return options.every((option): option is string => typeof option === "string") ? options : undefined;
}

function unwrapSchema(schema: unknown): unknown {
  let currentSchema = schema;

  for (let unwrapCount = 0; unwrapCount < 5; unwrapCount += 1) {
    if (!isRecord(currentSchema) || !isRecord(currentSchema._def) || !("innerType" in currentSchema._def)) {
      return currentSchema;
    }

    currentSchema = currentSchema._def.innerType;
  }

  return currentSchema;
}

function normalizeVariableInput(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
  );
}

function stringifyVariableMap(input: Readonly<Record<string, unknown>>, context: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(input)
      .filter((entry): entry is [string, unknown] => entry[1] !== undefined)
      .map(([key, value]) => {
        if (typeof value !== "string") {
          throw new Error(`${context}.${key} must resolve to a string.`);
        }

        return [key, value.trim()];
      }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAnswerStep(stepDefinition: FormStep): stepDefinition is AnswerStep {
  return (
    stepDefinition.kind === "choice" ||
    stepDefinition.kind === "text" ||
    stepDefinition.kind === "phone" ||
    stepDefinition.kind === "autocomplete" ||
    stepDefinition.kind === "trusted_form_consent"
  );
}
