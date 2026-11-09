// Email templates (Hebrew, right-to-left). Table layout + inline styles so they look right in Gmail,
// Outlook and phone mail apps. The logo is the app icon (PNG - some mail apps can't show WebP).
import type { Mail } from "./mail";

const APP = "אירוע פרוע";
/** With a Hebrew prefix letter the name needs quotes: ב"אירוע פרוע". */
const Q = `"${APP}"`;
const PURPLE = "#3b1d5e";
const LAVENDER = "#d8c0d8";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

interface Layout {
  origin: string;
  title: string;
  /** Paragraphs (plain text, escaped here). */
  lines: string[];
  cta?: { label: string; href: string };
  note?: string;
}

function layout({ origin, title, lines, cta, note }: Layout): { html: string; text: string } {
  const p = (t: string) =>
    `<p style="margin:0 0 14px;font-size:17px;line-height:1.6;color:#27272a;">${esc(t)}</p>`;
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 6px;">
        <tr><td align="center" bgcolor="${PURPLE}" style="border-radius:14px;">
          <a href="${esc(cta.href)}" style="display:inline-block;padding:15px 34px;font-size:18px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">${esc(cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:8px 0 0;font-size:13px;color:#71717a;text-align:center;">או להעתיק את הכתובת: <a href="${esc(cta.href)}" style="color:${PURPLE};">${esc(cta.href)}</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1f8;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl"
      style="max-width:560px;background:#ffffff;border-radius:22px;border:1px solid ${LAVENDER};font-family:Arial,'Segoe UI',Helvetica,sans-serif;text-align:right;">
      <tr><td align="center" style="padding:30px 24px 6px;">
        <img src="${esc(origin)}/icon-192.png" width="104" height="104" alt="${APP}" style="display:block;border:0;width:104px;height:104px;">
        <div style="margin-top:10px;font-size:26px;font-weight:800;color:${PURPLE};">${APP}</div>
      </td></tr>
      <tr><td style="padding:18px 30px 30px;">
        <h1 style="margin:0 0 16px;font-size:23px;line-height:1.35;color:${PURPLE};text-align:center;">${esc(title)}</h1>
        ${lines.map(p).join("\n        ")}
        ${button}
      </td></tr>
      <tr><td style="padding:16px 30px 22px;border-top:1px solid #f0e8f2;font-size:13px;line-height:1.5;color:#71717a;text-align:center;">
        ${esc(note || `נשלח מהאתר ${Q} · ${origin.replace(/^https?:\/\//, "")}`)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  const text = [APP, "", title, "", ...lines, ...(cta ? ["", `${cta.label}: ${cta.href}`] : []), "", note || origin].join("\n");
  return { html, text };
}

const hello = (name: string | null) => (name ? `שלום ${name},` : "שלום,");

/** To the user: approved from the waitlist, or added by the admin (same email for both). */
export function inviteMail(origin: string, to: string, name: string | null): Mail {
  const title = "ההרשמה שלך אושרה!";
  return {
    to,
    subject: `הוזמנת להשתמש ב${Q}`,
    ...layout({
      origin,
      title,
      lines: [
        hello(name),
        `החשבון שלך ב${Q} מוכן. עכשיו אפשר ליצור אתר לאירוע שלך, לשתף קוד QR עם האורחים ולאסוף את כל התמונות והסרטונים במקום אחד.`,
        `כדי להתחיל, נכנסים עם חשבון Google של הכתובת ${to}.`,
      ],
      cta: { label: "להתחלה", href: `${origin}/login` },
    }),
  };
}

/** To the admin: someone new asked to join. */
export function waitlistRequestMail(
  origin: string,
  to: string,
  person: { email: string; name: string | null },
  pendingCount: number,
): Mail {
  const who = person.name ? `${person.name} (${person.email})` : person.email;
  return {
    to,
    subject: `בקשת הצטרפות חדשה ל${Q}: ${person.name || person.email}`,
    ...layout({
      origin,
      title: "בקשת הצטרפות חדשה",
      lines: [
        `${who} ניסה/תה להתחבר לאתר ונכנס/ה לרשימת ההמתנה.`,
        pendingCount > 1 ? `כרגע ממתינים לאישור ${pendingCount} משתמשים.` : "זו הבקשה היחידה שממתינה כרגע.",
        "אפשר לאשר או לדחות בלוח ניהול האתר. אחרי האישור תישלח אליו/ה הזמנה במייל.",
      ],
      cta: { label: "לרשימת ההמתנה", href: `${origin}/admin?tab=waitlist` },
      note: "המייל נשלח אליך כי את/ה מנהל/ת האתר.",
    }),
  };
}

export function archivedMail(origin: string, to: string, name: string | null): Mail {
  return {
    to,
    subject: `החשבון שלך ב${Q} הושהה`,
    ...layout({
      origin,
      title: "החשבון שלך הושהה",
      lines: [
        hello(name),
        `מנהל האתר השהה את החשבון שלך ב${Q}. בינתיים אי אפשר להתחבר, ודפי האירועים שלך לא זמינים לאורחים.`,
        "התמונות והסרטונים שלך נשארים שמורים ב-Google Photos שלך.",
        "לשאלות אפשר לפנות למנהל האתר בתשובה למייל הזה.",
      ],
    }),
  };
}

export function restoredMail(origin: string, to: string, name: string | null): Mail {
  return {
    to,
    subject: `החשבון שלך ב${Q} חזר לפעול`,
    ...layout({
      origin,
      title: "החשבון שלך חזר לפעול",
      lines: [hello(name), "מנהל האתר החזיר את החשבון שלך. אפשר להתחבר שוב, ודפי האירועים שלך זמינים שוב לאורחים."],
      cta: { label: "כניסה לאתר", href: `${origin}/login` },
    }),
  };
}

export function deletedMail(origin: string, to: string, name: string | null): Mail {
  return {
    to,
    subject: `החשבון שלך ב${Q} נמחק`,
    ...layout({
      origin,
      title: "החשבון שלך נמחק",
      lines: [
        hello(name),
        `מנהל האתר מחק את החשבון שלך ב${Q}, יחד עם דפי האירועים שלך.`,
        "התמונות והסרטונים שהועלו נשארים שמורים ב-Google Photos שלך - הם לא נמחקו.",
        "לשאלות אפשר לפנות למנהל האתר בתשובה למייל הזה.",
      ],
    }),
  };
}

export function testMail(origin: string, to: string): Mail {
  return {
    to,
    subject: `בדיקת שליחת מיילים מ${Q}`,
    ...layout({
      origin,
      title: "שליחת המיילים עובדת",
      lines: ["זה מייל בדיקה מלוח ניהול האתר. אם קיבלת אותו, האתר יכול לשלוח הזמנות ועדכונים למשתמשים."],
      cta: { label: "ללוח הניהול", href: `${origin}/admin` },
    }),
  };
}
