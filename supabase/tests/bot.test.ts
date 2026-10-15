// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GROUP_HELP, PRIVATE_GREETING, botReply, webhookSecret } from "../functions/_shared/bot";

describe("leads bot replies", () => {
  it("answers any private message with the greeting", () => {
    expect(botReply({ message: { chat: { id: 42, type: "private" }, text: "/start" } })).toEqual({
      chat_id: 42,
      text: PRIVATE_GREETING,
    });
    expect(botReply({ message: { chat: { id: 42, type: "private" }, text: "привіт" } })?.text).toBe(PRIVATE_GREETING);
  });

  it("in groups answers only /start and /help (also addressed to the bot)", () => {
    const group = (text: string) => botReply({ message: { chat: { id: -5583246047, type: "group" }, text } });
    expect(group("/start")?.text).toBe(GROUP_HELP);
    expect(group("/help@denva_ai_leads_bot")?.text).toBe(GROUP_HELP);
    expect(group("нова заявка?")).toBeNull();
  });

  it("ignores updates without a message", () => {
    expect(botReply({})).toBeNull();
  });

  it("derives a stable webhook secret from the token", async () => {
    const a = await webhookSecret("123:abc");
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(await webhookSecret("123:abc")).toBe(a);
    expect(await webhookSecret("123:abd")).not.toBe(a);
  });
});
