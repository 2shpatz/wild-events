import { Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Armchair,
  ArrowRight,
  Camera,
  ClipboardList,
  Eye,
  FolderOpen,
  Gift,
  Images,
  LayoutDashboard,
  MailCheck,
  Music,
  Palette,
  QrCode,
  SlidersHorizontal,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { useFeed } from "../lib/useFeed";
import { applyTheme } from "../lib/themes";
import type { ManageEvent } from "../../shared/types";
import { EventStatus } from "../components/EventChrome";
import { StorageAccountSection } from "../components/manage/StorageAccountSection";
import { QRShare } from "../components/QRShare";
import { MediaManager } from "../components/manage/MediaManager";
import { AlbumsManager } from "../components/manage/AlbumsManager";
import { SettingsForm } from "../components/manage/SettingsForm";
import { DesignTab } from "../components/manage/DesignTab";
import { MusicTab } from "../components/manage/MusicTab";
import { ImportFromGoogle } from "../components/manage/ImportFromGoogle";
import { Card, LinkButton, Spinner, cx } from "../components/ui";
import { useManagePatch } from "../components/manage/useManagePatch";
import { ManageFeedContext } from "../components/manage/feedContext";
import { effectiveShareImage, ShareImagePicker } from "../components/manage/ShareImagePicker";
import { headerImageUrl } from "../components/EventHeader";
import { headerObjectPosition } from "../../shared/design";
import { SHARE_DESCRIPTION, SHARE_LOGO } from "../../shared/linkPreview";

// The guest planner (guest list, RSVP, seating, gifts, vendors, expenses) is a separate chunk.
const PlannerArea = lazy(() => import("../components/planner/PlannerArea"));

/**
 * Two main areas (tabs at the top), each with its own pages (icon-only rail on the right):
 * - "עמוד האורחים": what guests see - sharing, design, music
 * - "תמונות ואלבומים": the photos and the albums
 * - "ניהול האירוע": planning - dashboard, guest list, RSVP, seating, gifts, vendors, expenses, settings
 */
type Area = "guest" | "photos" | "event";
type PageId =
  | "share" | "media" | "albums" | "design" | "music"
  | "dashboard" | "guests" | "rsvp" | "seating" | "gifts" | "vendors" | "expenses" | "settings";

interface PageDef {
  id: PageId;
  area: Area;
  label: string;
  title: string;
  text: string;
  Icon: LucideIcon;
}

export const PAGES: PageDef[] = [
  { id: "share", area: "guest", label: "שיתוף ו-QR", title: "שיתוף ו-QR", text: "הקישור לעמוד האורחים, קוד QR להדפסה וההודעה שנשלחת עם הקישור.", Icon: QrCode },
  { id: "media", area: "photos", label: "תמונות", title: "תמונות וסרטונים", text: "כל מה שהועלה לאירוע: צפייה, הסתרה ומחיקה.", Icon: Images },
  { id: "albums", area: "photos", label: "אלבומים", title: "אלבומים", text: "האלבומים של האירוע, אלבומים מקושרים וייבוא מ-Google Photos.", Icon: FolderOpen },
  { id: "design", area: "guest", label: "עיצוב", title: "עיצוב עמוד האורחים", text: "הרקע, הכותרת והאלמנטים שהאורחים רואים, עם תצוגה מקדימה.", Icon: Palette },
  { id: "music", area: "guest", label: "מוזיקה", title: "מוזיקת רקע", text: "השירים שמתנגנים לאורחים בעמודי האירוע.", Icon: Music },
  { id: "dashboard", area: "event", label: "לוח בקרה", title: "לוח בקרה", text: "תמונת מצב: אישורי הגעה, מקומות ישיבה, תקציב ואזהרות על מה שדורש טיפול.", Icon: LayoutDashboard },
  { id: "guests", area: "event", label: "מוזמנים", title: "רשימת המוזמנים", text: "כל ההזמנות לפי משפחות: פרטים, צד, מעגל היכרות, כמה מוזמנים ומי מגיע. מסונכרן עם Google Sheets.", Icon: Users },
  { id: "rsvp", area: "event", label: "אישורי הגעה", title: "אישורי הגעה", text: "שליחת קישור אישי בוואטסאפ, תזכורות למי שלא ענה ורשימת טלפנים.", Icon: MailCheck },
  { id: "seating", area: "event", label: "סידור הושבה", title: "סידור הושבה", text: "מפת האולם: שולחנות, אלמנטים ושיבוץ משפחות לשולחנות, ידני או אוטומטי.", Icon: Armchair },
  { id: "gifts", area: "event", label: "מתנות", title: "מתנות", text: "רישום מהיר של מתנות וצ'קים, סיכומים ומעקב אחרי הודעות תודה.", Icon: Gift },
  { id: "vendors", area: "event", label: "נותני שירות", title: "נותני שירות", text: "אנשי הקשר של הספקים, עם חיוג, וואטסאפ וניווט בלחיצה, ודף קשר ליום האירוע.", Icon: Store },
  { id: "expenses", area: "event", label: "הוצאות ותקציב", title: "הוצאות ותקציב", text: "תקציב, הוצאות ותשלומים לספקים: מקדמות, יתרות ומועדי תשלום.", Icon: Wallet },
  { id: "settings", area: "event", label: "הגדרות", title: "הגדרות", text: "הגדרות האירוע, חשבון האחסון, והגדרות רשימת האורחים (צדדים, מעגלים, עמודות, Google Sheets).", Icon: SlidersHorizontal },
];
const AREAS: { id: Area; label: string; Icon: LucideIcon; first: PageId }[] = [
  { id: "guest", label: "עמוד האורחים", Icon: Eye, first: "share" },
  { id: "photos", label: "תמונות ואלבומים", Icon: Images, first: "media" },
  { id: "event", label: "ניהול האירוע", Icon: ClipboardList, first: "dashboard" },
];
const PLANNER_PAGES = new Set<PageId>(["dashboard", "guests", "rsvp", "seating", "gifts", "vendors", "expenses", "settings"]);

export default function Manage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [event, setEvent] = useState<ManageEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const feed = useFeed(code);
  // "import" (Google Photos) used to be its own tab; old links and the return from Google land on the merged albums tab.
  const raw = params.get("tab");
  const page = PAGES.find((p) => p.id === (raw === "import" ? "albums" : raw)) ?? PAGES[0];

  const load = useCallback(async () => {
    try {
      const ev = await api<ManageEvent>(`/e/${code}/manage`);
      setEvent(ev);
      applyTheme(ev.theme);
      document.title = `ניהול · ${ev.title}`;
    } catch (e: any) {
      if (e?.status === 403) navigate(`/${code}/admin`, { replace: true });
      else setError(e);
    }
  }, [code, navigate]);

  useEffect(() => {
    load();
  }, [load, feed.eventVersion]);

  if (!event) return <EventStatus error={error} loading />;
  return (
    <ManageFeedContext.Provider value={feed}>
      <ManageView event={event} code={code} page={page} feed={feed} load={load} setParams={setParams} />
    </ManageFeedContext.Provider>
  );
}

function ManageView({
  event,
  code,
  page,
  feed,
  load,
  setParams,
}: {
  event: ManageEvent;
  code: string;
  page: PageDef;
  feed: ReturnType<typeof useFeed>;
  load: () => Promise<void>;
  setParams: ReturnType<typeof useSearchParams>[1];
}) {
  const patch = useManagePatch(event, load);
  // New pages are kept in history (the phone's back button returns to the previous page).
  const go = (id: PageId) => {
    setParams({ tab: id });
    window.scrollTo({ top: 0 });
  };
  const pages = PAGES.filter((p) => p.area === page.area);
  const wide = page.id === "seating" || page.id === "guests" || page.id === "design";
  // Once a planner page was opened, keep its data loaded while moving between the event-management pages.
  const [plannerOpened, setPlannerOpened] = useState(PLANNER_PAGES.has(page.id));
  useEffect(() => {
    if (PLANNER_PAGES.has(page.id)) setPlannerOpened(true);
  }, [page.id]);

  return (
    // overflow-x-clip: a carousel's scrollIntoView must not scroll the whole page sideways (phones)
    <div className="min-h-dvh overflow-x-clip bg-bg">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to={event.isOwner ? "/dashboard" : `/${code}`} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-fg/5" aria-label="חזרה">
            <ArrowRight className="size-6" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{event.title}</p>
            <p className="text-sm text-muted-fg">
              {event.mediaCount.toLocaleString("he-IL")} פריטים · {event.albumCount.toLocaleString("he-IL")} אלבומים
            </p>
          </div>
          <div className="flex gap-2">
            <LinkButton href={`/${code}/upload`} variant="accent" size="sm" icon={<Camera className="size-4" aria-hidden />}>
              העלאה
            </LinkButton>
            <LinkButton
              href={`/${code}`}
              target="_blank"
              rel="noopener"
              aria-label="עמוד האורחים (נפתח בכרטיסייה חדשה)"
              variant="outline"
              size="sm"
              icon={<Eye className="size-4" aria-hidden />}
            >
              <span className="hidden sm:inline">צפייה בעמוד</span>
            </LinkButton>
          </div>
        </div>
        {/* Main areas */}
        <nav className="mx-auto flex max-w-7xl gap-1 px-4" aria-label="אזורי הניהול">
          {AREAS.map((a) => (
            <button
              key={a.id}
              onClick={() => a.id !== page.area && go(a.first)}
              aria-current={page.area === a.id ? "page" : undefined}
              className={cx(
                "inline-flex min-h-12 flex-1 items-center justify-center gap-2 border-b-[3px] px-1.5 text-[0.9375rem] font-bold leading-tight transition-colors duration-200 sm:flex-none sm:px-5 sm:text-base",
                page.area === a.id ? "border-primary text-fg" : "border-transparent text-muted-fg hover:text-fg",
              )}
            >
              <a.Icon className="hidden size-5 shrink-0 sm:block" aria-hidden />
              {a.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* The area's pages: icons only (name in the tooltip / for screen readers) */}
        <nav
          aria-label={AREAS.find((a) => a.id === page.area)!.label}
          className="sticky top-0 z-20 flex max-h-dvh w-16 shrink-0 flex-col items-center gap-1 self-start overflow-y-auto border-e border-border bg-card/60 py-3 no-scrollbar sm:w-[4.5rem]"
        >
          {pages.map((p) => (
            <RailButton key={p.id} page={p} active={p.id === page.id} onClick={() => go(p.id)} />
          ))}
        </nav>

        <main className={cx("min-w-0 flex-1 px-3 py-5 sm:px-6 sm:py-6", !wide && "max-w-5xl")}>
          <PageTitle page={page} />
          <div className="space-y-6">
            {/* The event's Google account storage (+ moving to another account) appears only under "Settings", but stays
                mounted on every page so a running move keeps copying while the owner looks at other pages. */}
            <div hidden={page.id !== "settings"}>
              <StorageAccountSection event={event} onChanged={load} />
            </div>

            {page.id === "share" && (
              <Card>
                <QRShare
                  code={event.code}
                  title={event.title}
                  shareText={event.shareText}
                  onSaveText={(text) => patch({ shareText: text }, text === null ? "חזרתם לנוסח המקורי" : "נוסח ההודעה נשמר")}
                  imagePicker={<ShareImagePicker event={event} onPick={(v) => patch({ shareImage: v }, "התמונה של הקישור נשמרה")} />}
                  linkCard={
                    effectiveShareImage(event) === "header"
                      ? { image: headerImageUrl(event)!, large: true, position: headerObjectPosition(event.design.hero), description: event.subtitle || SHARE_DESCRIPTION }
                      : { image: SHARE_LOGO.path, large: false, description: event.subtitle || SHARE_DESCRIPTION }
                  }
                />
              </Card>
            )}
            {page.id === "media" && <MediaManager code={code} feed={feed} albums={feed.albums} />}
            {page.id === "albums" && (
              <>
                <AlbumsManager event={event} onChanged={() => { load(); feed.reload(); }} />
                {/* Adding albums / photos from Google Photos (the owner's Google account is needed for it). */}
                {event.isOwner && (
                  <ImportFromGoogle code={code} albums={event.albums} quality={event.quality} eventAccount={event.storageAccount} onImported={() => { load(); feed.reload(); }} />
                )}
              </>
            )}
            {page.id === "design" && <DesignTab event={event} onChanged={load} />}
            {page.id === "music" && <MusicTab event={event} onChanged={load} />}
            {page.id === "settings" && <SettingsForm event={event} onChanged={load} />}

            {plannerOpened && page.area === "event" && (
              <Suspense fallback={<Spinner />}>
                <PlannerArea code={code} page={page.id} go={go} />
              </Suspense>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function PageTitle({ page }: { page: PageDef }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <page.Icon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{page.title}</h1>
        <p className="mt-1 max-w-3xl text-muted-fg">{page.text}</p>
      </div>
    </div>
  );
}

/** Icon-only page button; the name shows as a tooltip on hover / keyboard focus and is its accessible name. */
function RailButton({ page, active, onClick }: { page: PageDef; active: boolean; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={page.label}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
        active ? "bg-primary text-on-primary shadow-soft" : "text-muted-fg hover:bg-fg/5 hover:text-fg",
      )}
    >
      <page.Icon className="size-6" aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none absolute start-full top-1/2 z-30 ms-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-sm font-semibold text-white opacity-0 shadow-lift transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {page.label}
      </span>
    </button>
  );
}
