import "server-only";
export type Delivery =
  | { kind: "sent"; id: string }
  | { kind: "retry" | "failed" | "unknown"; error: string };
export function whatsappConfigured(env = process.env) {
  return [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_TEMPLATE_NAME",
    "WHATSAPP_TEMPLATE_LANGUAGE",
    "WHATSAPP_GRAPH_VERSION",
  ].every((k) => !!env[k]);
}
export async function sendReminder(
  phone: string,
  name: string,
  appointment: Date,
  fetcher: typeof fetch = fetch,
): Promise<Delivery> {
  if (!whatsappConfigured())
    return { kind: "failed", error: "PROVIDER_NOT_CONFIGURED" };
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(appointment);
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(appointment);
  try {
    const response = await fetcher(
      `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: process.env.WHATSAPP_TEMPLATE_NAME,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE },
            components: [
              {
                type: "body",
                parameters: [name, date, time].map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          },
        }),
      },
    );
    const result = await response.json();
    if (response.ok && typeof result.messages?.[0]?.id === "string")
      return { kind: "sent", id: result.messages[0].id };
    // Retry only explicit throttling rejection. 5xx/timeouts can have accepted delivery.
    if (response.status === 429 && result.error)
      return { kind: "retry", error: "PROVIDER_RATE_LIMIT" };
    if (response.status >= 400 && response.status < 500)
      return { kind: "failed", error: "PROVIDER_REJECTED" };
    return { kind: "unknown", error: "DELIVERY_UNKNOWN" };
  } catch {
    return { kind: "unknown", error: "DELIVERY_UNKNOWN" };
  }
}
