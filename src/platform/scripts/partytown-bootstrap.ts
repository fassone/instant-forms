import { libDirPath } from "@qwik.dev/partytown/utils";
import { readFileSync } from "node:fs";
import path from "node:path";

let partytownBootstrapSource: string | undefined;

export function getPartytownBootstrapSource(): string {
  partytownBootstrapSource ??= readFileSync(path.join(libDirPath(), "partytown.js"), "utf8");
  return partytownBootstrapSource;
}
