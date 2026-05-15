import { libDirPath } from "@qwik.dev/partytown/utils";
import path from "node:path";

import { DIST_FORMS_ROOT } from "../rendering/prebuilt-pages";

const partytownPublicPrefix = "/~partytown/";

export function getPartytownLibDistPath(): string {
  return path.join(process.cwd(), DIST_FORMS_ROOT, "~partytown");
}

export function getPartytownLibSourcePath(): string {
  return libDirPath();
}

export function getPartytownAssetPath(requestPath: string): string | undefined {
  if (!requestPath.startsWith(partytownPublicPrefix)) {
    return undefined;
  }

  const relativePath = requestPath.slice(partytownPublicPrefix.length);
  const safeRelativePath = getSafePartytownRelativePath(relativePath);
  if (!safeRelativePath) {
    return undefined;
  }

  const rootPath = process.env.NODE_ENV === "production" ? getPartytownLibDistPath() : getPartytownLibSourcePath();
  return path.join(rootPath, safeRelativePath);
}

function getSafePartytownRelativePath(relativePath: string): string | undefined {
  const normalizedPath = path.posix.normalize(relativePath);
  if (!normalizedPath || normalizedPath === "." || normalizedPath.startsWith("../") || normalizedPath.includes("/../")) {
    return undefined;
  }

  return normalizedPath;
}
