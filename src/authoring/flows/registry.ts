import type { InstantForm } from "../../platform/flow/dsl/types";
import { autoFlows } from "./auto/registry";
import { homeFlows } from "./home/registry";

export const authoredFlows = {
  ...prefixFlowKeys("auto", autoFlows),
  ...prefixFlowKeys("home", homeFlows),
} as const satisfies Record<string, InstantForm>;

function prefixFlowKeys(prefix: string, flows: Record<string, InstantForm>): Record<string, InstantForm> {
  return Object.fromEntries(Object.entries(flows).map(([key, form]) => [`${prefix}_${key}`, form]));
}
