import type { InstantForm } from "../../../platform/flow";
import { US_STATES } from "../../../shared/data/us-states";
import {
  defineAreaMetaPixelMap,
  type AreaMetaPixelKey,
  type AreaMetaPixelMap,
} from "../meta-pixels";
import { createHomeInsuranceFlow } from "./shared";

type AreaCode = (typeof US_STATES)[number]["code"];

export const homeAreaCodes = ["TX"] as const satisfies readonly AreaCode[];

const homeMetaPixelIds: AreaMetaPixelMap = defineAreaMetaPixelMap({
  tx: "1430748765773171",
});

const homeAreaCodeSet = new Set<string>(homeAreaCodes);

export const homeFlows = Object.fromEntries(
  US_STATES.filter((state) => homeAreaCodeSet.has(state.code)).map((state) => {
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
