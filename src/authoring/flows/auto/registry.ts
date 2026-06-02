import type { InstantForm } from "../../../platform/flow";
import { US_STATES } from "../../../shared/data/us-states";
import {
  defineAreaMetaPixelMap,
  type AreaMetaPixelKey,
  type AreaMetaPixelMap,
} from "../meta-pixels";
import { createAutoInsuranceFlow } from "./shared";

const autoMetaPixelIds: AreaMetaPixelMap = defineAreaMetaPixelMap({
  tn: "1465068051587670",
});

export const autoFlows = Object.fromEntries(
  US_STATES.map((state) => {
    const stateKey = state.code.toLowerCase() as AreaMetaPixelKey;
    const metaPixelId = autoMetaPixelIds[stateKey];

    return [
      stateKey,
      createAutoInsuranceFlow({
        flowName: state.code === "TN" ? "ES - TN - v6" : `ES - ${state.code} - v1`,
        areaCode: state.code,
        areaName: state.name,
        ...(metaPixelId ? { metaPixelId } : {}),
      }),
    ];
  }),
) as Record<string, InstantForm>;
