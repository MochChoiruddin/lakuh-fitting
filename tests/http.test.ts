import { expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ service: vi.fn() }));
import { body, failure, sameOrigin } from "../lib/http";
it("rejects cross-origin mutations", () => {
  expect(() =>
    sameOrigin(
      new Request("https://fitting.example/api/reservations", {
        headers: { origin: "https://other.example" },
      }),
    ),
  ).toThrow("FORBIDDEN");
  expect(() =>
    sameOrigin(
      new Request("https://fitting.example/api/reservations", {
        headers: { origin: "https://fitting.example" },
      }),
    ),
  ).not.toThrow();
});
it("bounds body size and rejects malformed JSON", async () => {
  const request = (value: string) =>
    new Request("https://fitting.example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: value,
    });
  await expect(body(request("x".repeat(5000)))).rejects.toThrow("INVALID_BODY");
  await expect(body(request("{"))).rejects.toThrow("INVALID_BODY");
  await expect(body(request('{"ok":true}'))).resolves.toEqual({ ok: true });
});
it("does not expose internal errors or private provider payloads", async () => {
  const response = failure(new Error("internal-sensitive-test-value"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("internal-sensitive-test-value");
});
