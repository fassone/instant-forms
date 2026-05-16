import type {
  AnswerStep,
  EnforceAnswerStepKeys,
  FormContract,
  FormFlowDefinitionBase,
  FormFlowInput,
  FormStep,
  InstantForm,
} from "./types";
import { getStepDynamicResolverDependencies, isDynamicResolver } from "./dynamic-resolvers";
import { createFlowAuthoringHelpers, type FlowAuthoringHelpers } from "./step-builders";

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
  assertAnswerStepContract(input.contract, steps);
  assertKnownTemplateVariables(input.contract, { name: input.name, page: input.page, steps });

  return {
    name: input.name,
    status: input.status,
    contract: input.contract,
    context,
    customVariables: context,
    payload: input.payload,
    page: input.page,
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
    assertShowWhenContract(contract, stepDefinition, seenAnswerKeys);
    assertDynamicResolverDependencies(contract, stepDefinition, seenAnswerKeys);

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
  input: { name: string; page: { name: string }; steps: readonly FormStep[] },
): void {
  const contextKeys = new Set(getSchemaKeys(contract.context));
  const templates = [
    input.name,
    input.page.name,
    ...input.steps.flatMap((stepDefinition) => getStepTemplateStrings(stepDefinition)),
  ];

  for (const template of templates) {
    for (const variableName of getTemplateVariableNames(template)) {
      if (!contextKeys.has(variableName)) {
        throw new Error(`Template variable "{{${variableName}}}" is not declared in contract.context.`);
      }
    }
  }
}

function getStepTemplateStrings(stepDefinition: FormStep): string[] {
  const values = [stepDefinition.label];

  if (stepDefinition.kind === "choice") {
    values.push(...stepDefinition.options.map((option) => option.value));
  }

  if (stepDefinition.kind === "interstitial") {
    values.push(
      stepDefinition.loadingLabel,
      ...(isDynamicResolver(stepDefinition.benefits) ? [] : stepDefinition.benefits),
      ...stepDefinition.successLines.map((line) => line.text),
    );
  }

  if (stepDefinition.kind === "trusted_form_consent") {
    values.push(stepDefinition.disclosure, stepDefinition.checkboxLabel, stepDefinition.submitLabel);
  }

  return values;
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
    stepDefinition.kind === "autocomplete"
  );
}
