import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { eventByCode } from "../lib/db";
import { assertOwnAccount, freeBytes } from "../lib/accounts";
import { cancelMove, estimateMove, getMigration, startMove, stepMove } from "../lib/migration";
import { rateLimit } from "../lib/session";

/** Moving an event to another of the owner's Google accounts (the owner's own decision only). */
export const migrate = new Hono<AppEnv>();

async function ownerEvent(c: Context<AppEnv>) {
  const ev = await eventByCode(c.env, c.req.param("code")!);
  if (!c.get("ownerId") || c.get("ownerId") !== ev.owner_id) throw new HTTPException(403, { message: "owner_only" });
  return ev;
}

/** What the move would copy, and how much room the target account has (null = unlimited / unknown). */
migrate.get("/e/:code/migrate/estimate", async (c) => {
  const ev = await ownerEvent(c);
  const to = await assertOwnAccount(c.env, ev.owner_id, c.req.query("to"));
  const [estimate, free] = await Promise.all([estimateMove(c.env, ev, to), freeBytes(c.env, ev.owner_id, to)]);
  return c.json({ ...estimate, free });
});

migrate.post("/e/:code/migrate", async (c) => {
  const ev = await ownerEvent(c);
  const { to } = await c.req.json<{ to?: string }>();
  const ref = await assertOwnAccount(c.env, ev.owner_id, to);
  await rateLimit(c.env, `migrate:${ev.id}`, 20, 86_400_000);
  return c.json(await startMove(c.env, ev, ref));
});

migrate.get("/e/:code/migrate/:job", async (c) => {
  const ev = await ownerEvent(c);
  return c.json(await getMigration(c.env, ev, c.req.param("job")));
});

/** The browser calls this in a loop until the status is no longer "running". */
migrate.post("/e/:code/migrate/:job/next", async (c) => {
  const ev = await ownerEvent(c);
  return c.json(await stepMove(c.env, ev, c.req.param("job")));
});

migrate.post("/e/:code/migrate/:job/cancel", async (c) => {
  const ev = await ownerEvent(c);
  return c.json(await cancelMove(c.env, ev, c.req.param("job")));
});
