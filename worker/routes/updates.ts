// Site admin: versions and updates (mounted under /api/admin/updates, behind requireSiteAdmin).
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { rateLimit } from "../lib/session";
import { putSetting } from "../lib/site";
import { checkFeed, cleanHookUrl, markSeen, saveHook, triggerRebuild, updatesInfo } from "../lib/updates";
import { APP, compareVersions } from "../lib/appInfo";

export const updates = new Hono<AppEnv>();

updates.get("/", async (c) => c.json(await updatesInfo(c)));

/** "Check now". */
updates.post("/check", async (c) => {
  await rateLimit(c.env, `upd-check:${c.get("ownerId")}`, 20, 60 * 60_000);
  await checkFeed(c.env);
  return c.json(await updatesInfo(c));
});

/** "Update now": rebuild through the Deploy Hook right away (also during an event: the admin decided). */
updates.post("/trigger", async (c) => {
  await rateLimit(c.env, `upd-trigger:${c.get("ownerId")}`, 3, 60 * 60_000);
  const info = await updatesInfo(c);
  const target = info.latest && compareVersions(info.latest, APP.version) > 0 ? info.latest : APP.version;
  const r = await triggerRebuild(c.env, target);
  if (!r.ok) throw new HTTPException(502, { message: "hook_failed", cause: r.error });
  return c.json(await updatesInfo(c));
});

updates.put("/settings", async (c) => {
  const body = await c.req.json<{ hookUrl?: unknown; auto?: unknown }>().catch(() => ({}) as { hookUrl?: unknown; auto?: unknown });
  if (body.hookUrl !== undefined) {
    // null or "" removes the hook; anything else must be a valid URL (cleanHookUrl rejects non-strings).
    await saveHook(c.env, body.hookUrl === null || body.hookUrl === "" ? null : cleanHookUrl(body.hookUrl, new URL(c.req.url).origin));
  }
  if (typeof body.auto === "boolean") await putSetting(c, "update_auto", body.auto ? "1" : "0");
  return c.json(await updatesInfo(c));
});

/** The admin read the "the site was updated" notice. */
updates.post("/seen", async (c) => {
  await markSeen(c.env);
  return c.json({ ok: true });
});
