import type { InstantForm } from "../../platform/flow/dsl/types";
import { autoFlows } from "./auto/registry";

export const authoredFlows = {
  ...autoFlows,
} as const satisfies Record<string, InstantForm>;
