import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { genericAutoFlow } from "../../src/authoring/flows/generic";
import { formRoutes } from "../../src/authoring/routes/registry";
import { createFetchHandler } from "../../src/platform/app/server";
import { encodeCheckpointAnswers, getCheckpointCookieName } from "../../src/platform/persistence/checkpoints";
import { defineFormRoutes, registerFormRoutePages } from "../../src/platform/routing";

const origin = "http://localhost";
const started = { welcome_started: "started" };

function checkpointCookie(routeKey: string, answers: Record<string, string>): string {
  return getCheckpointCookieName(routeKey) + "=" + encodeCheckpointAnswers(answers);
}

describe("public page trailing slashes", () => {
  it("normalizes roots, product selection, steps and previews before route fallbacks", async () => {
    const handler = createFetchHandler();
    const paths = [
      "/auto", "/hogar", "/producto",
      "/auto/inicio", "/hogar/inicio", "/auto/tn", "/hogar/tx",
      "/auto/tn/inicio", "/hogar/tx/inicio",
      "/__preview/auto", "/__preview/hogar/tx", "/__preview/producto",
      "/__preview/auto/inicio", "/__preview/hogar/tx/inicio",
    ];
    for (const method of ["GET", "HEAD"]) {
      for (const path of paths) {
        const response = await handler(new Request(origin + path + "/", { method }));
        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe(path);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("Set-Cookie")).toBeNull();
      }
    }
  });

  it("preserves encoded and repeated query parameters and trims extra trailing slashes in one redirect", async () => {
    const handler = createFetchHandler();
    const query = "?state=FL&fbclid=CLICK%2F123&source_channel=web+site&tag=a&tag=b&next=%2Fhogar%2F";
    const response = await handler(new Request(origin + "/auto///" + query));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auto" + query);
    const resumed = await handler(new Request(origin + response.headers.get("Location")));
    expect(resumed.headers.get("Location")).toBe("/auto/inicio?fbclid=CLICK%2F123&source_channel=web+site&state=FL");
  });

  it("keeps saved progress and guarded steps intact after normalization", async () => {
    const handler = createFetchHandler();
    const cases: [string, string, Record<string, string>, string][] = [
      ["/auto", "auto", { ...started, residence_state: "TX" }, "/auto/tiene-licencia"],
      ["/hogar", "hogar", { ...started, property_state: "CA" }, "/hogar/dueno-o-renta"],
      ["/auto/tn", "auto_tn", { ...started, belongs_to_state: "yes" }, "/auto/tn/tiene-licencia"],
      ["/hogar/tx", "hogar_tx", { ...started, property_in_state: "yes" }, "/hogar/tx/dueno-o-renta"],
    ];
    for (const [root, routeKey, answers, step] of cases) {
      const headers = { Cookie: checkpointCookie(routeKey, answers) };
      const normalized = await handler(new Request(origin + root + "/", { headers }));
      expect(normalized.headers.get("Location")).toBe(root);
      expect(normalized.headers.get("Set-Cookie")).toBeNull();
      const resumed = await handler(new Request(origin + root, { headers }));
      expect(resumed.headers.get("Location")).toBe(step);
      const normalizedStep = await handler(new Request(origin + step + "/", { headers }));
      expect(normalizedStep.headers.get("Location")).toBe(step);
      expect((await handler(new Request(origin + step, { headers }))).status).toBe(200);
      const guarded = await handler(new Request(origin + step));
      expect(guarded.status).toBe(302);
      expect(guarded.headers.get("Location")).toBe(root + "/inicio");
    }
  });

  it("reaches a page or a genuine 404 without redirect loops", async () => {
    const handler = createFetchHandler();
    for (const [path, expectedPath, status] of [
      ["/auto/", "/auto/inicio", 200],
      ["/hogar/", "/hogar/inicio", 200],
      ["/producto/", "/producto", 200],
      ["/auto/tn/inicio/", "/auto/tn/inicio", 200],
      ["/__preview/hogar/tx/inicio/", "/__preview/hogar/tx/inicio", 200],
      ["/auto/fl/", "/auto/inicio?state=FL", 200],
      ["/auto/zz/", "/auto/zz", 404],
      ["/cotizar/", "/cotizar/", 404],
      ["/cotizar/producto/", "/cotizar/producto/", 404],
    ] as const) {
      let url = origin + path;
      const visited = new Set<string>();
      for (let hop = 0; hop < 4; hop += 1) {
        expect(visited.has(url)).toBe(false);
        visited.add(url);
        const response = await handler(new Request(url));
        const location = response.headers.get("Location");
        if (!location) {
          expect(response.status).toBe(status);
          break;
        }
        expect(hop).toBeLessThan(3);
        url = new URL(location, url).href;
      }
      expect(url).toBe(origin + expectedPath);
    }
  });

  it("uses authored route folders rather than hardcoded product prefixes", async () => {
    const app = new Hono();
    registerFormRoutePages(app, defineFormRoutes({
      index: formRoutes.index,
      folders: { quotes: genericAutoFlow },
      notFound: formRoutes.notFound,
    }));
    for (const path of ["/quotes", "/quotes/inicio", "/__preview/quotes/inicio"]) {
      const response = await app.request(origin + path + "/");
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(path);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect((await app.request(origin + "/auto/")).status).toBe(404);
  });

  it("leaves the root, unregistered prefixes, API, asset and proxy paths unchanged", async () => {
    const handler = createFetchHandler();
    const root = await handler(new Request(origin + "/"));
    expect(root.status).toBe(200);
    expect(root.headers.get("Location")).toBeNull();
    for (const path of [
      "/automobile/", "/producto-extra/", "/unregistered/", "/__preview/unregistered/",
      "/api/forms/auto/checkpoints/", "/assets/logo.webp/",
      "/_instant/forms/missing/transition.js/", "/_instant/scripts/missing.js/",
      "/_instant/meta/proxy/", "/~partytown/missing/",
    ]) {
      const response = await handler(new Request(origin + path));
      expect(response.headers.get("Location")).toBeNull();
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("does not redirect POST or other non-navigation methods", async () => {
    const handler = createFetchHandler();
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await handler(new Request(origin + "/producto/", { method }));
      expect(response.status).toBe(404);
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }
    const submission = await handler(new Request(origin + "/producto", {
      method: "POST", body: new URLSearchParams({ product: "auto" }),
    }));
    expect(submission.status).toBe(303);
    expect(submission.headers.get("Location")).toBe("/auto");
    expect(submission.headers.get("Set-Cookie")).toContain(checkpointCookie("auto", started));
  });
});
