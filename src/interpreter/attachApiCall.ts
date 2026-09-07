import { test } from "@playwright/test";
import type { APIResponse } from "@playwright/test";

const SECRET_HEADER_NAMES = new Set(["authorization", "x-api-key", "api-key", "cookie"]);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SECRET_HEADER_NAMES.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

/**
 * Attaches the request and response as two separate, clearly labeled blocks to
 * the current test.step — Allure and the Playwright HTML report both render each
 * `attach()` call as its own named panel. Auth headers are redacted so secrets
 * never land in report/trace output.
 */
export async function attachApiCall(
  method: string,
  url: string,
  body: unknown,
  requestHeaders: Record<string, string>,
  response: APIResponse
): Promise<void> {
  const responseBody = await response.text().catch(() => "<unreadable body>");

  await test.info().attach("Request", {
    body: JSON.stringify(
      { method: method.toUpperCase(), url, headers: redactHeaders(requestHeaders), body },
      null,
      2
    ),
    contentType: "application/json",
  });

  await test.info().attach("Response", {
    body: JSON.stringify(
      { status: response.status(), headers: response.headers(), body: safeParse(responseBody) },
      null,
      2
    ),
    contentType: "application/json",
  });
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
