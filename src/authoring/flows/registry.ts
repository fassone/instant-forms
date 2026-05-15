import type { InstantForm } from "../../platform/flow/dsl/types";
import { tnFlow } from "./tn/flow";

export const authoredFlows = {
  tn: tnFlow,
} as const satisfies Record<string, InstantForm>;
