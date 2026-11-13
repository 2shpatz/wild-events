// Link previews: when an event link is pasted into WhatsApp, Facebook, Telegram..., their servers read the page's
// Open Graph tags. The site is a single-page app, so the Worker adds the event's tags to index.html here.
import type { Env } from "../env";
import { RESERVED_SLUGS, SLUG_RE } from "../../shared/slug";
import { SHARE_DESCRIPTION as DEFAULT_DESCRIPTION, SHARE_LOGO as LOGO } from "../../shared/linkPreview";

const SITE_NAME = "אירוע פרוע";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface PreviewRow {
  code: string;
  title: string;
  subtitle: string | null;
  share_image: string | null;
  og: string | null;
  hd: string | null;
}

/** index.html with the event's preview tags for /<slug> and its sub-pages; null = not an event page. */
export async function eventPagePreview(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const code = (url.pathname.split("/")[1] || "").toLowerCase();
  if (!SLUG_RE.test(code) || RESERVED_SLUGS.has(code)) return null;

  let ev: PreviewRow | null;
  try {
    ev = await env.DB.prepare(
      `SELECT e.code, e.title, e.subtitle, e.share_image,
              (SELECT etag FROM event_assets a WHERE a.event_id = e.id AND a.kind = 'og') AS og,
              (SELECT etag FROM event_assets a WHERE a.event_id = e.id AND a.kind = 'hd') AS hd
         FROM events e
        WHERE e.code = ? AND e.deleted = 0
          AND NOT EXISTS (SELECT 1 FROM owners o JOIN members m ON m.google_sub = o.google_sub
                           WHERE o.id = e.owner_id AND m.status = 'archived')`,
    )
      .bind(code)
      .first<PreviewRow>();
  } catch (e) {
    // e.g. right after a new version, before the database structure was updated: the page still loads, without tags.
    console.error("link preview", e);
    return null;
  }
  if (!ev) return null;

  // Conditional headers dropped: the stored index.html must not answer 304 for a page whose tags differ.
  const page = await env.ASSETS.fetch(new Request(url.toString(), { method: request.method }));
  if (!page.ok || !(page.headers.get("Content-Type") || "").includes("text/html")) return page;

  const origin = env.CANONICAL_ORIGIN ? new URL(env.CANONICAL_ORIGIN).origin : url.origin;
  const description = ev.subtitle || DEFAULT_DESCRIPTION;
  const headerTag = ev.share_image !== "logo" ? (ev.og ? "og" : ev.hd ? "hd" : null) : null;
  const image = headerTag
    ? `${origin}/api/e/${ev.code}/asset/${headerTag}?v=${encodeURIComponent((headerTag === "og" ? ev.og : ev.hd)!)}`
    : `${origin}${LOGO.path}`;

  const props: [string, string][] = [
    ["og:type", "website"],
    ["og:site_name", SITE_NAME],
    ["og:locale", "he_IL"],
    ["og:url", `${origin}/${ev.code}`],
    ["og:title", ev.title],
    ["og:description", description],
    ["og:image", image],
    ["og:image:alt", headerTag ? `תמונת הכותרת של ${ev.title}` : `הלוגו של ${SITE_NAME}`],
    ...(headerTag ? [] : ([["og:image:width", String(LOGO.size)], ["og:image:height", String(LOGO.size)]] as [string, string][])),
  ];
  const tags = [
    `<meta name="description" content="${esc(description)}" />`,
    ...props.map(([p, c]) => `<meta property="${p}" content="${esc(c)}" />`),
    `<meta name="twitter:card" content="${headerTag ? "summary_large_image" : "summary"}" />`,
  ].join("\n    ");

  const out = new HTMLRewriter()
    .on("title", { element: (el) => void el.setInnerContent(`${ev.title} · ${SITE_NAME}`) })
    .on('meta[name="description"]', { element: (el) => void el.remove() })
    .on("head", { element: (el) => void el.append(`    ${tags}\n  `, { html: true }) })
    .transform(page);
  const headers = new Headers(out.headers);
  headers.delete("ETag");
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache");
  return new Response(request.method === "HEAD" ? null : out.body, { status: out.status, headers });
}
