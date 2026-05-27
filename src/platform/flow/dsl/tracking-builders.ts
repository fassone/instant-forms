import type {
  ContractSchemaKeys,
  FormContract,
  TrackingAuthoringHelpers,
  TrackingEventConfig,
  TrackingEventInput,
  TrackingEventKind,
} from "./types";

export function createTrackingAuthoringHelpers<TContract extends FormContract>(): TrackingAuthoringHelpers<TContract> {
  return {
    event: {
      formView: createEventBuilder("formView"),
      stepView: createEventBuilder("stepView"),
      stepAnswer: createEventBuilder("stepAnswer"),
      validationError: createEventBuilder("validationError"),
      trustedFormSubstepView: createEventBuilder("trustedFormSubstepView"),
      submitAttempt: createEventBuilder("submitAttempt"),
      submitSuccess: createEventBuilder("submitSuccess"),
      submitError: createEventBuilder("submitError"),
    },
  };
}

function createEventBuilder<TKind extends TrackingEventKind>(kind: TKind) {
  return function buildTrackingEvent<TContract extends FormContract>(
  input: TrackingEventInput<TKind, ContractSchemaKeys<TContract["context"]>, TContract>,
  ): TrackingEventConfig<TKind, ContractSchemaKeys<TContract["context"]>, TContract> {
    return {
      kind,
      ...input,
    } as TrackingEventConfig<TKind, ContractSchemaKeys<TContract["context"]>, TContract>;
  };
}
