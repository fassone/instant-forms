import type { MetaPixelId } from "../../platform/flow";
import { US_STATES } from "../../shared/data/us-states";
import { metaPixelIdSchema } from "../integrations/google-tag-manager";

type AreaCode = (typeof US_STATES)[number]["code"];
export type AreaMetaPixelKey = Lowercase<AreaCode>;
export type AreaMetaPixelMap = Partial<Record<AreaMetaPixelKey, MetaPixelId>>;

const validAreaMetaPixelKeys = new Set<string>(US_STATES.map((state) => state.code.toLowerCase()));

export function defineAreaMetaPixelMap<const TMap extends AreaMetaPixelMap>(
  map: TMap & Record<Exclude<keyof TMap, AreaMetaPixelKey>, never>,
): TMap {
  for (const [key, value] of Object.entries(map)) {
    if (!validAreaMetaPixelKeys.has(key)) {
      throw new Error(`Unknown Meta Pixel area key "${key}". Expected a lowercase US state code.`);
    }

    const result = metaPixelIdSchema.safeParse(value);
    if (!result.success) {
      throw new Error(`Invalid Meta Pixel ID for area "${key}".`);
    }
  }

  return map;
}
