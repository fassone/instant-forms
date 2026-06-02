import type { InstantForm } from "../../../platform/flow";
import { US_STATES } from "../../../shared/data/us-states";
import { createHomeInsuranceFlow } from "./shared";

export const homeFlows = Object.fromEntries(
  US_STATES.map((state) => [
    state.code.toLowerCase(),
    createHomeInsuranceFlow({
      flowName: `ES - ${state.code} Home - v1`,
      areaCode: state.code,
      areaName: state.name,
    }),
  ]),
) as Record<string, InstantForm>;
