export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: string,
  ) {
    super(code);
  }
}

/** Hebrew, human messages for every error code the server can return. */
const MESSAGES: Record<string, string> = {
  event_not_found: "האירוע לא נמצא. כדאי לבדוק שהקישור נכון.",
  event_unavailable: "האירוע הזה לא זמין כרגע.",
  admin_only: "רק מנהל/ת האתר יכול/ה לגשת לכאן.",
  member_not_found: "המשתמש/ת לא נמצא/ה - אולי כבר טופל/ה.",
  already_member: "הכתובת הזו כבר ברשימת המשתמשים המורשים.",
  member_archived: "הכתובת הזו בארכיון. אפשר להחזיר אותה מלשונית הארכיון.",
  not_pending: "הבקשה הזו כבר טופלה.",
  not_approved: "אפשר לשלוח הזמנה רק למשתמשים מורשים.",
  already_archived: "החשבון כבר בארכיון.",
  not_archived: "אפשר לבצע את זה רק לחשבון שנמצא בארכיון.",
  cannot_change_self: "אי אפשר להעביר לארכיון או למחוק את החשבון שלך.",
  login_required: "צריך להתחבר כדי להמשיך.",
  not_allowed: "אין לך הרשאה לפעולה הזו.",
  owner_only: "רק בעל האירוע (שמחובר עם Google) יכול לבצע את הפעולה הזו.",
  guest_required: "צריך להזדהות בשם לפני העלאה.",
  album_not_found: "האלבום לא נמצא - אולי הוא הוסר.",
  uploads_closed: "בעל האירוע סגר את ההעלאות לאירוע הזה.",
  unsupported_type: "אפשר להעלות רק תמונות וסרטונים.",
  too_large: "הקובץ גדול מדי.",
  storage_full: "נגמר המקום באחסון של בעל האירוע ב-Google. כדאי להודיע לו.",
  owner_reauth: "החיבור לחשבון ה-Google שבו נשמרות התמונות של האירוע פג. בעל האירוע צריך לחבר אותו מחדש.",
  maintenance: "האתר בתחזוקה קצרה. נסו להעלות שוב בעוד כמה דקות.",
  migrating: "האירוע עובר עכשיו לחשבון Google אחר. אפשר לעשות את זה כשההעברה תסתיים.",
  bad_account: "חשבון ה-Google הזה לא נמצא ברשימה שלך. נסו לבחור שוב.",
  account_disconnected: "החיבור לחשבון ה-Google הזה פג. צריך לחבר אותו מחדש.",
  account_not_found: "חשבון ה-Google לא נמצא - אולי הוא כבר נותק.",
  account_in_use: "אי אפשר לנתק את החשבון כי יש בו תמונות של אירוע. קודם מעבירים את האירוע לחשבון אחר.",
  same_account: "האירוע כבר נמצא בחשבון הזה.",
  migration_not_found: "ההעברה לא נמצאה.",
  google_rate_limited: "Google עמוסה כרגע. ננסה שוב בעוד רגע.",
  google_error: "Google החזירה שגיאה. ננסה שוב.",
  too_many_attempts: "יותר מדי ניסיונות. כדאי לחכות כמה דקות.",
  bad_password: "הסיסמה שגויה.",
  password_too_short: "הסיסמה קצרה מדי (לפחות 4 תווים).",
  bad_setup_token: "קוד ההגדרה שגוי.",
  setup_locked: "צריך את קישור ההגדרה כדי להיכנס לכאן.",
  bad_client_id: "ה-Client ID לא נראה תקין. הוא אמור להסתיים ב-apps.googleusercontent.com.",
  bad_client_secret: "ה-Client Secret לא נראה תקין.",
  bad_email: "כתובת האימייל לא נראית תקינה.",
  title_required: "צריך לתת שם לאירוע.",
  bad_code: "הכתובת יכולה להכיל רק אותיות באנגלית, ספרות ומקף (3-40 תווים), וחלק מהמילים שמורות לאתר.",
  code_taken: "הכתובת הזו כבר תפוסה. נסו כתובת אחרת.",
  name_required: "צריך לכתוב שם.",
  bad_device: "משהו השתבש בזיהוי המכשיר. כדאי לרענן את העמוד ולנסות שוב.",
  board_closed: "האלמנט הזה כבר לא מופיע בעמוד.",
  message_empty: "צריך לכתוב משהו לפני השליחה.",
  message_too_long: "ההודעה ארוכה מדי.",
  board_full: "לוח ההודעות מלא.",
  item_empty: "צריך לכתוב מה להוסיף לרשימה.",
  too_many_items: "הרשימה מלאה - אפשר עד 100 פריטים.",
  cannot_delete_host_album: "את האלבום של בעלי השמחה אי אפשר למחוק.",
  job_not_found: "הייבוא לא נמצא.",
  bad_album_link: "הקישור לא נראה כמו קישור לאלבום ב-Google Photos. הוא אמור להתחיל ב-https://photos.app.goo.gl/ או ב-https://photos.google.com/.",
  not_linked: "האלבום הזה לא מקושר לאלבום ב-Google Photos.",
  not_ready: "הבחירה עוד לא הסתיימה.",
  bad_audio: "אפשר להעלות רק קובצי שמע מסוג MP3 או M4A.",
  track_too_large: "השיר גדול מדי (עד 20MB). אפשר לשמור אותו באיכות נמוכה יותר ולנסות שוב.",
  too_many_tracks: "הגעתם למספר השירים המקסימלי לאירוע (30). אפשר למחוק שיר ישן ולהעלות חדש.",
  empty: "הקובץ ריק.",
  not_found: "הפריט לא נמצא - אולי הוא כבר נמחק.",
  network: "אין חיבור לאינטרנט. ננסה שוב כשהחיבור יחזור.",
  server_error: "משהו השתבש אצלנו. ננסה שוב.",
  updating: "האתר מתעדכן לגרסה חדשה. נסו שוב בעוד רגע.",
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] || MESSAGES.server_error;
  if (e instanceof TypeError) return MESSAGES.network;
  return MESSAGES.server_error;
}

const UPDATING_RETRY_MS = [500, 1000, 2000, 3000, 4000];

export async function api<T = any>(
  path: string,
  init: RequestInit & { json?: unknown; guest?: string | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  if (init.guest) headers.set("X-Guest", init.guest);
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`/api${path}`, { ...init, headers, body, credentials: "same-origin" });
    // Right after a new version the server updates its database for a moment (503 + X-Updating); the request
    // never reached the app, so it is safe to send again.
    if (res.status !== 503 || !res.headers.get("X-Updating") || attempt >= UPDATING_RETRY_MS.length) break;
    await new Promise((r) => setTimeout(r, UPDATING_RETRY_MS[attempt]));
  }
  if (!res.ok) {
    let code = "server_error";
    let detail: string | undefined;
    try {
      const j = await res.json();
      code = j.error || code;
      detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
