// Site admin dashboard API: members (allowlist), waitlist, archive and site settings.
// Only the site admin (the Google account claimed through the setup link) can reach it.
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "../env";
import { decrypt } from "../lib/crypto";
import { cleanName } from "../lib/db";
import { revokeToken } from "../lib/google";
import { endUserSessions, requireSiteAdmin } from "../lib/session";
import { sendMail, type Mail, type MailError } from "../lib/mail";
import { archivedMail, deletedMail, inviteMail, restoredMail, testMail } from "../lib/emails";
import { cleanEmail, getSetting, getSiteAdmin, putSetting, siteOrigin, waitlistEnabled, type MemberRow, type MemberStatus } from "../lib/site";
import { saveOperator } from "./setup";
import type { AdminOverview, MemberDTO, MemberEventDTO } from "../../shared/types";

export const admin = new Hono<AppEnv>();
admin.use("/*", requireSiteAdmin);

/** Most invitations sent in one request (bulk approve) - keeps within the platform's outgoing-request limits. */
const BULK_MAIL_MAX = 40;

const origin = (c: Context<AppEnv>) => siteOrigin(c.env, c.req.url);

async function member(env: Env, email: string): Promise<MemberRow> {
  const m = await env.DB.prepare("SELECT * FROM members WHERE email = ?").bind(email).first<MemberRow>();
  if (!m) throw new HTTPException(404, { message: "member_not_found" });
  return m;
}

/** The admin can't lock themselves out. */
async function notSelf(env: Env, m: MemberRow) {
  const a = await getSiteAdmin(env);
  if (a && (m.google_sub === a.sub || m.email === a.email.toLowerCase())) throw new HTTPException(400, { message: "cannot_change_self" });
}

async function mail(env: Env, m: Mail): Promise<{ mailed: boolean; mailError?: MailError }> {
  const r = await sendMail(env, m);
  return r.sent ? { mailed: true } : { mailed: false, mailError: r.reason };
}

async function invite(c: Context<AppEnv>, m: { email: string; name: string | null }) {
  const r = await mail(c.env, inviteMail(origin(c), m.email, m.name));
  if (r.mailed) await c.env.DB.prepare("UPDATE members SET invited_at = ? WHERE email = ?").bind(Date.now(), m.email).run();
  return r;
}

async function body<T>(c: Context<AppEnv>): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    return {} as T;
  }
}

// ---------------------------------------------------------------- overview

admin.get("/overview", async (c) => {
  const counts = await c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM members GROUP BY status").all<{ status: MemberStatus; n: number }>();
  const by = Object.fromEntries(counts.results.map((r) => [r.status, r.n]));
  const a = await getSiteAdmin(c.env);
  const out: AdminOverview = {
    counts: { approved: by.approved ?? 0, pending: by.pending ?? 0, archived: by.archived ?? 0 },
    waitlistEnabled: await waitlistEnabled(c),
    mail: { connected: !!a?.mailConnected, email: a?.email ?? null },
    admin: a ? { email: a.email, name: a.name } : null,
    operator: { name: (await getSetting(c, "operator_name")) || "", email: (await getSetting(c, "operator_email")) || "" },
  };
  return c.json(out);
});

// ---------------------------------------------------------------- members

admin.get("/members", async (c) => {
  const status = c.req.query("status") || "approved";
  if (!["approved", "pending", "archived"].includes(status)) throw new HTTPException(400, { message: "bad_status" });
  const a = await getSiteAdmin(c.env);
  const rows = await c.env.DB.prepare(
    `SELECT m.*, o.last_login_at,
       (SELECT COUNT(*) FROM events e WHERE e.owner_id = o.id AND e.deleted = 0) AS events,
       (SELECT COUNT(*) FROM albums al JOIN events e ON e.id = al.event_id
         WHERE e.owner_id = o.id AND e.deleted = 0 AND al.hidden = 0) AS albums,
       (SELECT COUNT(*) FROM media x JOIN events e ON e.id = x.event_id
         WHERE e.owner_id = o.id AND e.deleted = 0 AND x.hidden = 0) AS photos
     FROM members m LEFT JOIN owners o ON o.google_sub = m.google_sub
     WHERE m.status = ?
     ORDER BY COALESCE(m.archived_at, m.requested_at, m.approved_at, m.created_at) DESC`,
  )
    .bind(status)
    .all<MemberRow & { last_login_at: number | null; events: number | null; albums: number | null; photos: number | null }>();
  const members: MemberDTO[] = rows.results.map((r) => ({
    email: r.email,
    name: r.name,
    picture: r.picture,
    status: r.status,
    source: r.source as MemberDTO["source"],
    isAdmin: !!a && (r.google_sub === a.sub),
    requestedAt: r.requested_at,
    approvedAt: r.approved_at,
    archivedAt: r.archived_at,
    invitedAt: r.invited_at,
    lastLoginAt: r.last_login_at,
    events: r.events ?? 0,
    albums: r.albums ?? 0,
    photos: r.photos ?? 0,
  }));
  return c.json({ members });
});

/** One member's events, each with its album and photo counts. */
admin.get("/members/events", async (c) => {
  const m = await member(c.env, cleanEmail(c.req.query("email")));
  if (!m.google_sub) return c.json({ events: [] });
  const rows = await c.env.DB.prepare(
    `SELECT e.code, e.title, e.event_date, e.created_at,
       (SELECT COUNT(*) FROM albums a WHERE a.event_id = e.id AND a.hidden = 0) AS albums,
       (SELECT COUNT(*) FROM media x WHERE x.event_id = e.id AND x.hidden = 0) AS photos
     FROM events e JOIN owners o ON o.id = e.owner_id
     WHERE o.google_sub = ? AND e.deleted = 0 ORDER BY e.created_at DESC`,
  )
    .bind(m.google_sub)
    .all<{ code: string; title: string; event_date: string | null; created_at: number; albums: number; photos: number }>();
  const events: MemberEventDTO[] = rows.results.map((r) => ({
    code: r.code,
    title: r.title,
    date: r.event_date,
    createdAt: r.created_at,
    albums: r.albums,
    photos: r.photos,
  }));
  return c.json({ events });
});

/** Add someone by email (or approve them if they were already waiting). Sends the invitation. */
admin.post("/members", async (c) => {
  const b = await body<{ email?: string; name?: string }>(c);
  const email = cleanEmail(b.email);
  const name = cleanName(b.name || "", 80) || null;
  const now = Date.now();
  const existing = await c.env.DB.prepare("SELECT * FROM members WHERE email = ?").bind(email).first<MemberRow>();
  if (existing?.status === "approved") throw new HTTPException(409, { message: "already_member" });
  if (existing?.status === "archived") throw new HTTPException(409, { message: "member_archived" });
  if (existing) {
    await c.env.DB.prepare("UPDATE members SET status = 'approved', approved_at = ?, name = COALESCE(?, name) WHERE email = ?")
      .bind(now, name, email)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO members (email, name, status, source, approved_at, created_at) VALUES (?, ?, 'approved', 'manual', ?, ?)",
    )
      .bind(email, name, now, now)
      .run();
  }
  return c.json({ ok: true, ...(await invite(c, { email, name: name ?? existing?.name ?? null })) });
});

admin.post("/members/approve", async (c) => {
  const m = await member(c.env, cleanEmail((await body<{ email?: string }>(c)).email));
  if (m.status !== "pending") throw new HTTPException(409, { message: "not_pending" });
  await c.env.DB.prepare("UPDATE members SET status = 'approved', approved_at = ? WHERE email = ?").bind(Date.now(), m.email).run();
  return c.json({ ok: true, ...(await invite(c, m)) });
});

/** Send the invitation again. */
admin.post("/members/invite", async (c) => {
  const m = await member(c.env, cleanEmail((await body<{ email?: string }>(c)).email));
  if (m.status !== "approved") throw new HTTPException(409, { message: "not_approved" });
  return c.json({ ok: true, ...(await invite(c, m)) });
});

/** Remove a waitlist request (no email). They can ask again by logging in. */
admin.post("/members/reject", async (c) => {
  const m = await member(c.env, cleanEmail((await body<{ email?: string }>(c)).email));
  if (m.status !== "pending") throw new HTTPException(409, { message: "not_pending" });
  await c.env.DB.prepare("DELETE FROM members WHERE email = ?").bind(m.email).run();
  return c.json({ ok: true });
});

/** Archive: blocks login, logs them out and takes their event pages offline (all reversible). */
admin.post("/members/archive", async (c) => {
  const b = await body<{ email?: string; notify?: boolean }>(c);
  const m = await member(c.env, cleanEmail(b.email));
  if (m.status === "archived") throw new HTTPException(409, { message: "already_archived" });
  await notSelf(c.env, m);
  const owner = m.google_sub
    ? await c.env.DB.prepare("SELECT id FROM owners WHERE google_sub = ?").bind(m.google_sub).first<{ id: string }>()
    : null;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE members SET status = 'archived', archived_at = ? WHERE email = ?").bind(Date.now(), m.email),
    ...(owner ? endUserSessions(c.env, owner.id) : []),
  ]);
  return c.json({ ok: true, ...(b.notify ? await mail(c.env, archivedMail(origin(c), m.email, m.name)) : {}) });
});

admin.post("/members/restore", async (c) => {
  const b = await body<{ email?: string; notify?: boolean }>(c);
  const m = await member(c.env, cleanEmail(b.email));
  if (m.status !== "archived") throw new HTTPException(409, { message: "not_archived" });
  await c.env.DB.prepare(
    "UPDATE members SET status = 'approved', archived_at = NULL, approved_at = COALESCE(approved_at, ?) WHERE email = ?",
  )
    .bind(Date.now(), m.email)
    .run();
  return c.json({ ok: true, ...(b.notify ? await mail(c.env, restoredMail(origin(c), m.email, m.name)) : {}) });
});

/**
 * Permanent delete (only from the archive): the member, their account, events and everything stored about them.
 * Photos and videos stay in the user's own Google Photos - the site can't (and shouldn't) delete those.
 */
admin.post("/members/delete", async (c) => {
  const b = await body<{ email?: string; notify?: boolean }>(c);
  const m = await member(c.env, cleanEmail(b.email));
  if (m.status !== "archived") throw new HTTPException(409, { message: "not_archived" });
  await notSelf(c.env, m);
  // Tell them first - afterwards there is nothing left to send from.
  const mailed = b.notify ? await mail(c.env, deletedMail(origin(c), m.email, m.name)) : {};
  const owner = m.google_sub
    ? await c.env.DB.prepare("SELECT id, refresh_token_enc FROM owners WHERE google_sub = ?")
        .bind(m.google_sub)
        .first<{ id: string; refresh_token_enc: string | null }>()
    : null;
  const db = c.env.DB;
  const stmts = [db.prepare("DELETE FROM members WHERE email = ?").bind(m.email)];
  // Extra Google accounts they connected for event photos: withdraw the site's access too.
  const extra = owner
    ? (await db.prepare("SELECT refresh_token_enc FROM storage_accounts WHERE owner_id = ?").bind(owner.id).all<{ refresh_token_enc: string | null }>()).results
    : [];
  if (owner) {
    const ev = "SELECT id FROM events WHERE owner_id = ?";
    stmts.unshift(
      ...endUserSessions(c.env, owner.id),
      db.prepare(`DELETE FROM import_items WHERE job_id IN (SELECT id FROM import_jobs WHERE owner_id = ?)`).bind(owner.id),
      db.prepare("DELETE FROM import_jobs WHERE owner_id = ?").bind(owner.id),
      db.prepare(`DELETE FROM storage_migration_albums WHERE job_id IN (SELECT id FROM storage_migrations WHERE event_id IN (${ev}))`).bind(owner.id),
      ...["event_assets", "album_devices", "media", "changes", "uploads", "event_tracks", "albums", "storage_migrations"].map((t) =>
        db.prepare(`DELETE FROM ${t} WHERE event_id IN (${ev})`).bind(owner.id),
      ),
      db.prepare("DELETE FROM events WHERE owner_id = ?").bind(owner.id),
      db.prepare("DELETE FROM storage_accounts WHERE owner_id = ?").bind(owner.id),
      db.prepare("DELETE FROM owners WHERE id = ?").bind(owner.id),
    );
  }
  await db.batch(stmts);
  for (const enc of [owner?.refresh_token_enc, ...extra.map((a) => a.refresh_token_enc)]) {
    if (!enc) continue;
    try {
      await revokeToken(await decrypt(c.env.TOKEN_ENC_KEY, enc));
    } catch {
      /* the grant may already be gone */
    }
  }
  return c.json({ ok: true, ...mailed });
});

// ---------------------------------------------------------------- settings

/** Turn the waitlist on/off. Turning it off may also approve everyone waiting (and invite them). */
admin.put("/settings/waitlist", async (c) => {
  const b = await body<{ enabled?: boolean; approvePending?: boolean }>(c);
  const enabled = b.enabled !== false;
  await putSetting(c, "waitlist_enabled", enabled ? "1" : "0");
  if (enabled || !b.approvePending) return c.json({ ok: true, approved: 0, mailed: 0, notMailed: 0 });
  const pending = await c.env.DB.prepare("SELECT * FROM members WHERE status = 'pending'").all<MemberRow>();
  await c.env.DB.prepare("UPDATE members SET status = 'approved', approved_at = ? WHERE status = 'pending'").bind(Date.now()).run();
  let mailed = 0;
  let mailError: MailError | undefined;
  for (const m of pending.results.slice(0, BULK_MAIL_MAX)) {
    const r = await invite(c, m);
    if (r.mailed) mailed++;
    else {
      mailError = r.mailError;
      if (r.mailError !== "error") break; // not connected / API off: the rest would fail the same way
    }
  }
  const approved = pending.results.length;
  return c.json({ ok: true, approved, mailed, notMailed: approved - mailed, mailError });
});

admin.put("/settings/operator", async (c) => {
  await saveOperator(c, await body<{ name?: string; email?: string }>(c));
  return c.json({ ok: true });
});

admin.post("/mail/test", async (c) => {
  const a = await getSiteAdmin(c.env);
  if (!a) throw new HTTPException(400, { message: "admin_only" });
  return c.json(await mail(c.env, testMail(origin(c), a.email)));
});
