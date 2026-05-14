import type { InstantForm } from "../../platform/flow/dsl/types";
import { tnFlow } from "./tn/flow";

export const formsByArea = {
  tn: tnFlow,
} as const satisfies Record<string, InstantForm>;
