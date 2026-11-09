// Sends email from the site admin's own Gmail (Gmail API, "gmail.send" scope granted only by the admin).
// Plain fetch calls - works on any hosting platform. Never throws: the caller's action (approve, archive...)
// must succeed even when the email can't be sent, and the dashboard tells the admin what happened.
import type { Env } from "../env";
import { b64url } from "./crypto";
import { GoogleError, ownerToken } from "./google";
import { getSiteAdmin } from "./site";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** not_connected: the admin hasn't allowed sending yet · api_disabled: Gmail API is off in Google Cloud. */
export type MailError = "not_connected" | "api_disabled" | "reauth" | "error";
export type MailResult = { sent: true } | { sent: false; reason: MailError };

const enc = new TextEncoder();
const b64 = (s: string) => {
  let bin = "";
  for (const byte of enc.encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};
/** RFC 2047 encoded header (Hebrew subjects / names). */
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
/** Base64 body wrapped at 76 chars (RFC 2045). */
const body = (s: string) => b64(s).replace(/.{76}/g, "$&\r\n");

function buildMime(from: { email: string; name: string | null }, mail: Mail) {
  const boundary = `b_${crypto.randomUUID().replace(/-/g, "")}`;
  const fromLine = from.name ? `${header(from.name)} <${from.email}>` : from.email;
  return [
    `From: ${fromLine}`,
    `To: ${mail.to}`,
    `Subject: ${header(mail.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body(mail.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body(mail.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendMail(env: Env, mail: Mail): Promise<MailResult> {
  const admin = await getSiteAdmin(env);
  if (!admin?.mailConnected) return { sent: false, reason: "not_connected" };
  try {
    const token = await ownerToken(env, admin.id);
    const raw = b64url(enc.encode(buildMime({ email: admin.email, name: admin.name }, mail)));
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (res.ok) return { sent: true };
    const text = await res.text();
    console.warn("gmail send failed", res.status, text.slice(0, 300));
    if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(text)) {
      return { sent: false, reason: "api_disabled" };
    }
    if (res.status === 401 || res.status === 403) return { sent: false, reason: "reauth" };
    return { sent: false, reason: "error" };
  } catch (e) {
    console.warn("gmail send error", e);
    if (e instanceof GoogleError && e.needsReauth) return { sent: false, reason: "reauth" };
    return { sent: false, reason: "error" };
  }
}
