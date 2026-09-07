import type { CustomStep } from "apitest-framework/types/customStep";

/**
 * Fires repeated bad-credential login attempts and checks whether the API starts
 * responding 429 before it responds 200. There's no declarative way to express
 * "keep hitting this until you see status X (or N attempts pass)" or to inspect
 * a whole sequence of responses at once, so this has to be a custom step.
 */
export const probeLoginRateLimit: CustomStep = async (ctx) => {
  const attempts = 20;
  const statuses: number[] = [];

  for (let i = 0; i < attempts; i++) {
    const res = await ctx.request.fetch("/api/auth/login", {
      method: "POST",
      data: { email: "rate-limit-probe@example.com", password: "definitely-wrong" },
    });
    statuses.push(res.status());
  }

  ctx.vars.loginAttemptStatuses = statuses;
  ctx.vars.sawRateLimited = statuses.includes(429);

  if (!ctx.vars.sawRateLimited) {
    throw new Error(
      `Expected a 429 somewhere in ${attempts} rapid login attempts, never saw one. ` +
        `Statuses observed: ${JSON.stringify(statuses)}`,
    );
  }
};

/**
 * Sends a request body that is not valid JSON at all (truncated mid-object), to check
 * the API rejects it with 400 rather than 500ing or silently coercing it. `body:` in a
 * normal `operation:` step is always a structured value that gets serialized correctly,
 * so producing genuinely malformed JSON on the wire requires bypassing that and writing
 * the raw string ourselves.
 */
export const sendMalformedBookingJson: CustomStep = async (ctx) => {
  const roleRequest = await ctx.roleRequest(ctx.defaultAuth ?? "admin");
  const res = await roleRequest.fetch("/api/booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    data: '{"origin": {"label": "Warehouse A", "lat": 40.7128, "lng": -74.0060}, "destination": ',
  });

  ctx.vars.malformedJsonStatus = res.status();
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  ctx.vars.malformedJsonBody = body;

  if (res.status() !== 400) {
    throw new Error(
      `Expected 400 for a truncated/malformed JSON body, got ${res.status()}. ` +
        `Body: ${JSON.stringify(body)}`,
    );
  }
};
