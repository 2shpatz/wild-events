// Vendors' contract files (worker/routes/planner.ts) against a fake Google Drive and an in-memory SQLite "D1".
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { bundle, d1 } from "./harness.mjs";

// Workers-only global used by the upload route
globalThis.FixedLengthStream ??= class extends TransformStream {
  constructor() {
    super();
  }
};

const { makeApp, encrypt } = await bundle(`
  import { Hono } from "hono";
  import { planner } from "./worker/routes/planner.ts";
  export { encrypt } from "./worker/lib/crypto.ts";
  // the event-password session of event e1 (what loadSession sets after /admin/login)
  export function makeApp() {
    const app = new Hono().basePath("/api");
    app.use("*", async (c, next) => { c.set("adminEventId", c.req.header("X-Test-Manager") === "no" ? undefined : "e1"); await next(); });
    app.route("/", planner);
    app.onError((e, c) => c.json({ error: e.message }, e.status ?? 500));
    return app;
  }
`);

function fakeDrive() {
  const files = new Map();
  const deleted = [];
  let n = 0;
  const json = (b, status = 200, headers = {}) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...headers } });
  const fetchMock = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || "GET";
    if (u.pathname === "/drive/v3/files" && method === "POST") return json({ id: "folder0000001" });
    if (u.pathname.startsWith("/upload/drive/v3/files") && method === "POST") return json({}, 200, { Location: "https://upload.test/session/1" });
    if (u.hostname === "upload.test" && method === "PUT") {
      const buf = Buffer.from(await new Response(init.body).arrayBuffer());
      const id = `file${String(++n).padStart(10, "0")}`;
      files.set(id, buf);
      return json({ id });
    }
    const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === "DELETE") {
        deleted.push(id);
        files.delete(id);
        return new Response(null, { status: 204 });
      }
      if (u.searchParams.get("alt") === "media") return files.has(id) ? new Response(files.get(id), { headers: { "Content-Length": String(files.get(id).length) } }) : json({ error: { message: "not found" } }, 404);
      return json({ id, trashed: false });
    }
    return json({ error: { message: "unexpected " + method + " " + url } }, 500);
  };
  return { files, deleted, fetchMock };
}

async function setup() {
  const DB = d1();
  const KEY = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const env = { DB, TOKEN_ENC_KEY: KEY, SESSION_SECRET: "s", SETUP_TOKEN: "x" };
  const tok = await encrypt(KEY, "access");
  DB.raw.prepare("INSERT INTO owners (id, google_sub, email, refresh_token_enc, access_token_enc, access_expires, created_at) VALUES ('o1','sub1','o@test', ?, ?, ?, 0)").run(tok, tok, Date.now() + 3600_000);
  DB.raw.prepare("INSERT INTO events (id, owner_id, code, title, type, theme, created_at) VALUES ('e1','o1','demo','האירוע','wedding','wedding',0)").run();
  const app = makeApp();
  const req = (path, init = {}) => app.request(`/api/e/demo/planner${path}`, init, env);
  const r = await req("/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "vendor", data: { name: "אולם הגן", category: "venue", files: [{ id: "injectedFile123", name: "x", mime: "application/pdf" }] } }) });
  const { record } = await r.json();
  return { env, DB, req, vendor: record };
}

const pdf = Buffer.from("%PDF-1.4 fake contract");
const upload = (req, id, body, type = "application/pdf", name = "חוזה אולם.pdf") =>
  req(`/records/${id}/files`, { method: "POST", headers: { "Content-Type": type, "Content-Length": String(body.length), "X-Filename": encodeURIComponent(name) }, body });

test("upload, open, keep on edit, delete", async () => {
  const drive = fakeDrive();
  globalThis.fetch = drive.fetchMock;
  const { req, vendor, DB } = await setup();
  assert.deepEqual(vendor.files, [], "files sent by the browser on create are ignored");

  let r = await upload(req, vendor.id, pdf);
  assert.equal(r.status, 200, await r.clone().text());
  let rec = (await r.json()).record;
  assert.equal(rec.files.length, 1);
  const f = rec.files[0];
  assert.equal(f.name, "חוזה אולם.pdf");
  assert.equal(f.mime, "application/pdf");
  assert.equal(f.size, pdf.length);
  assert.equal(f.acc, "self");
  assert.equal(DB.raw.prepare("SELECT value FROM settings WHERE key LIKE 'vendor_docs_folder:%'").get().value, "folder0000001", "folder id remembered");

  r = await req(`/records/${vendor.id}/files/${f.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "application/pdf");
  assert.match(r.headers.get("Content-Disposition"), /^inline; filename\*=UTF-8''/);
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), pdf.toString());

  // editing the vendor (the browser sends an empty / forged list) keeps the stored files
  r = await req(`/records/${vendor.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { ...rec, notes: "מקדמה שולמה", files: [] } }) });
  rec = (await r.json()).record;
  assert.equal(rec.notes, "מקדמה שולמה");
  assert.equal(rec.files.length, 1);

  // Word files download instead of opening
  r = await upload(req, vendor.id, Buffer.from("docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "הצעה.docx");
  rec = (await r.json()).record;
  r = await req(`/records/${vendor.id}/files/${rec.files[1].id}`);
  assert.match(r.headers.get("Content-Disposition"), /^attachment;/);

  r = await req(`/records/${vendor.id}/files/${f.id}`, { method: "DELETE" });
  rec = (await r.json()).record;
  assert.equal(rec.files.length, 1);
  assert.ok(drive.deleted.includes(f.id), "deleted from Drive");
});

test("refuses bad types, big files, too many files, outsiders", async () => {
  const drive = fakeDrive();
  globalThis.fetch = drive.fetchMock;
  const { req, vendor } = await setup();
  let r = await upload(req, vendor.id, Buffer.from("<script>"), "text/html", "x.html");
  assert.equal(r.status, 415);
  r = await req(`/records/${vendor.id}/files`, { method: "POST", headers: { "Content-Type": "application/pdf", "Content-Length": String(16 * 1024 * 1024), "X-Filename": "big.pdf" }, body: Buffer.alloc(10) });
  assert.equal(r.status, 413);
  for (let i = 0; i < 10; i++) assert.equal((await upload(req, vendor.id, pdf)).status, 200);
  r = await upload(req, vendor.id, pdf);
  assert.equal(r.status, 409, "at most 10 files");
  r = await req(`/records/${vendor.id}/files/file0000000001`, { headers: { "X-Test-Manager": "no" } });
  assert.equal(r.status, 403, "only managers open files");
  r = await req(`/records/${vendor.id}/files/notMineAtAll1234`);
  assert.equal(r.status, 404, "only files listed on the vendor");
});

test("deleting a vendor removes its files from Drive", async () => {
  const drive = fakeDrive();
  globalThis.fetch = drive.fetchMock;
  const { req, vendor, DB } = await setup();
  await upload(req, vendor.id, pdf);
  await upload(req, vendor.id, pdf, "image/jpeg", "חתימה.jpg");
  const r = await req(`/records/${vendor.id}`, { method: "DELETE" });
  assert.equal(r.status, 200);
  assert.equal(drive.deleted.length, 2);
  const row = DB.raw.prepare("SELECT data, deleted_at FROM planner_records WHERE id = ?").get(vendor.id);
  assert.ok(row.deleted_at, "soft-deleted (undo possible)");
  assert.deepEqual(JSON.parse(row.data).files, [], "an undo brings it back without the deleted files");
});
