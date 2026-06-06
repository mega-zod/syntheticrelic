import type { ApiErrorResponse } from "./types";

const JSON_HEADERS = {
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export function jsonResponse<T>(body: T, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...init?.headers,
    },
  });
}

export function errorResponse(error: string, status = 400, details?: string[]) {
  return jsonResponse<ApiErrorResponse>(
    {
      error,
      ...(details?.length ? { details } : {}),
    },
    { status },
  );
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS,
  });
}
