import { getFormByStateCode } from "./forms";
import { renderFormPage, renderUnavailablePage } from "./render";
import { validateSubmission, type SubmissionPayload } from "./validation";

const logoAssetUrl = new URL("./assets/logo.webp", import.meta.url);

export type SubmissionLogger = (payload: SubmissionPayload) => void;

export type AppOptions = {
  logger?: SubmissionLogger;
};

export function createFetchHandler(options: AppOptions = {}) {
  const logger = options.logger ?? (() => undefined);

  return async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (request.method === "GET" && url.pathname === "/") {
      return Response.redirect(new URL("/tn", url).toString(), 302);
    }

    if (request.method === "GET" && url.pathname === "/assets/logo.webp") {
      return assetResponse(Bun.file(logoAssetUrl), "image/webp");
    }

    if (
      request.method === "POST" &&
      segments.length === 4 &&
      segments[0] === "api" &&
      segments[1] === "forms" &&
      segments[3] === "submissions"
    ) {
      const stateCode = segments[2];

      if (!stateCode) {
        return jsonResponse({ ok: false, errors: [{ field: "stateCode", message: "State code is required." }] }, 400);
      }

      return handleSubmission(request, stateCode, logger);
    }

    if (request.method === "GET" && segments.length === 1) {
      const stateCode = segments[0];

      if (!stateCode) {
        return htmlResponse(renderUnavailablePage(""), 404);
      }

      const form = getFormByStateCode(stateCode);

      if (!form) {
        return htmlResponse(renderUnavailablePage(stateCode), 404);
      }

      return htmlResponse(renderFormPage(form));
    }

    return htmlResponse(renderUnavailablePage("esta ruta"), 404);
  };
}

async function handleSubmission(
  request: Request,
  stateCode: string,
  logger: SubmissionLogger,
): Promise<Response> {
  const form = getFormByStateCode(stateCode);

  if (!form) {
    return jsonResponse(
      { ok: false, errors: [{ field: "stateCode", message: "State form is not available." }] },
      404,
    );
  }

  const body = await parseJsonBody(request);

  if (!body.ok) {
    return jsonResponse({ ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] }, 400);
  }

  const validation = validateSubmission(form, body.value);

  if (validation.ok === false) {
    return jsonResponse({ ok: false, errors: validation.errors }, 400);
  }

  logger(validation.payload);

  return jsonResponse({ ok: true, submittedAt: validation.payload.submittedAt }, 201);
}

async function parseJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function assetResponse(body: Blob, contentType: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
