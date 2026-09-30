import { afterEach, describe, expect, it, vi } from "vitest";
import { sendReminder } from "../lib/whatsapp";
const keys = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TEMPLATE_NAME",
  "WHATSAPP_TEMPLATE_LANGUAGE",
  "WHATSAPP_GRAPH_VERSION",
];
afterEach(() => vi.unstubAllEnvs());
function configured() {
  keys.forEach((k) => vi.stubEnv(k, "test-placeholder"));
}
describe("official provider safety", () => {
  it("does not send or report success without credentials", async () => {
    keys.forEach((k) => vi.stubEnv(k, ""));
    const fetcher = vi.fn();
    expect(
      await sendReminder("6281234567890", "Test", new Date(), fetcher),
    ).toEqual({ kind: "failed", error: "PROVIDER_NOT_CONFIGURED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ["04:00", "11.00"],
    ["08:00", "15.00"],
  ])("formats UTC %s as Jakarta %s", async (utc, local) => {
    configured();
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ messages: [{ id: "test-message" }] }));
    expect(
      await sendReminder(
        "6281234567890",
        "Test",
        new Date(`2026-09-27T${utc}:00Z`),
        fetcher,
      ),
    ).toEqual({ kind: "sent", id: "test-message" });
    const data = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(data.type).toBe("template");
    expect(
      data.template.components[0].parameters.map(
        (p: { text: string }) => p.text,
      ),
    ).toEqual(["Test", "27 September 2026", local]);
  });
  it("retries explicit rate rejection only", async () => {
    configured();
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: { code: 130429 } }, { status: 429 }),
      );
    expect(
      (await sendReminder("6281234567890", "Test", new Date(), fetcher)).kind,
    ).toBe("retry");
  });
  it.each([200, 500, 503])(
    "treats status %s without message id as ambiguous",
    async (status) => {
      configured();
      expect(
        (
          await sendReminder(
            "6281234567890",
            "Test",
            new Date(),
            vi.fn().mockResolvedValue(Response.json({}, { status })),
          )
        ).kind,
      ).toBe("unknown");
    },
  );
  it("does not retry network uncertainty", async () => {
    configured();
    expect(
      (
        await sendReminder(
          "6281234567890",
          "Test",
          new Date(),
          vi.fn().mockRejectedValue(new Error("private provider payload")),
        )
      ).kind,
    ).toBe("unknown");
  });
});
