import type { InstantForm } from "../../../platform/flow";
import { US_STATES } from "../../../shared/data/us-states";
import {
  defineAreaMetaPixelMap,
  type AreaMetaPixelKey,
  type AreaMetaPixelMap,
} from "../meta-pixels";
import { createAutoInsuranceFlow } from "./shared";

type AreaCode = (typeof US_STATES)[number]["code"];

export const autoAreaCodes = ["NC", "GA", "CA", "MD", "AZ", "WA", "TX", "OR", "TN"] as const satisfies readonly AreaCode[];

const autoMetaPixelIds: AreaMetaPixelMap = defineAreaMetaPixelMap({
  ca: "2458973931233184",
  wa: "2077393396531838",
  az: "1635608547544151",
  ga: "1517247936797373",
  nc: "1495714788306246",
  md: "1390550429792530",
  tx: "1297957409158074",
  tn: "1025903583116475",
  or: "1015581570992603",
});

const autoAreaCodeSet = new Set<string>(autoAreaCodes);

export const autoFlows = Object.fromEntries(
  US_STATES.filter((state) => autoAreaCodeSet.has(state.code)).map((state) => {
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
