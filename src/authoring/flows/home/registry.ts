import type { InstantForm } from "../../../platform/flow";
import { US_STATES } from "../../../shared/data/us-states";
import {
  defineAreaMetaPixelMap,
  type AreaMetaPixelKey,
  type AreaMetaPixelMap,
} from "../meta-pixels";
import { createHomeInsuranceFlow } from "./shared";

const homeMetaPixelIds: AreaMetaPixelMap = defineAreaMetaPixelMap({});

export const homeFlows = Object.fromEntries(
  US_STATES.map((state) => {
    const stateKey = state.code.toLowerCase() as AreaMetaPixelKey;
    const metaPixelId = homeMetaPixelIds[stateKey];

    return [
      stateKey,
      createHomeInsuranceFlow({
        flowName: `ES - ${state.code} Home - v1`,
        areaCode: state.code,
        areaName: state.name,
        ...(metaPixelId ? { metaPixelId } : {}),
      }),
    ];
  }),
) as Record<string, InstantForm>;
