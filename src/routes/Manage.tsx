import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, CloudDownload, Eye, FolderOpen, Images, Music, Palette, QrCode, SlidersHorizontal, Camera } from "lucide-react";
import { api } from "../lib/api";
import { useFeed } from "../lib/useFeed";
import { applyTheme } from "../lib/themes";
import type { ManageEvent } from "../../shared/types";
import { EventStatus } from "../components/EventChrome";
import { StorageMeter } from "../components/StorageMeter";
import { QRShare } from "../components/QRShare";
import { MediaManager } from "../components/manage/MediaManager";
import { AlbumsManager } from "../components/manage/AlbumsManager";
import { SettingsForm } from "../components/manage/SettingsForm";
import { DesignTab } from "../components/manage/DesignTab";
import { MusicTab } from "../components/manage/MusicTab";
import { ImportFromGoogle } from "../components/manage/ImportFromGoogle";
import { Card, LinkButton, cx } from "../components/ui";

type Tab = "share" | "media" | "albums" | "import" | "design" | "music" | "settings";

export default function Manage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [event, setEvent] = useState<ManageEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const feed = useFeed(code);
  const tab = (params.get("tab") as Tab) || "share";

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

  const tabs: { id: Tab; label: string; icon: React.ReactNode; ownerOnly?: boolean }[] = [
    { id: "share", label: "שיתוף ו-QR", icon: <QrCode className="size-4" aria-hidden /> },
    { id: "media", label: "תמונות", icon: <Images className="size-4" aria-hidden /> },
    { id: "albums", label: "אלבומים", icon: <FolderOpen className="size-4" aria-hidden /> },
    { id: "import", label: "אלבומים מ-Google Photos", icon: <CloudDownload className="size-4" aria-hidden />, ownerOnly: true },
    { id: "design", label: "עיצוב", icon: <Palette className="size-4" aria-hidden /> },
    { id: "music", label: "מוזיקה", icon: <Music className="size-4" aria-hidden /> },
    { id: "settings", label: "הגדרות", icon: <SlidersHorizontal className="size-4" aria-hidden /> },
  ];

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to={event.isOwner ? "/dashboard" : `/${code}`} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-fg/5" aria-label="חזרה">
            <ArrowRight className="size-6" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{event.title}</h1>
            <p className="text-sm text-muted-fg">
              {event.mediaCount.toLocaleString("he-IL")} פריטים · {event.albumCount.toLocaleString("he-IL")} אלבומים · קוד <span dir="ltr">{event.code}</span>
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
              עמוד האורחים
            </LinkButton>
          </div>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4" aria-label="ניהול">
          {tabs
            .filter((t) => !t.ownerOnly || event.isOwner)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setParams({ tab: t.id }, { replace: true })}
                aria-current={tab === t.id ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-[3px] px-3 font-semibold transition-colors duration-200",
                  tab === t.id ? "border-primary text-fg" : "border-transparent text-muted-fg hover:text-fg",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Always show the main user's storage usage + link to the real Google Photos. */}
        <StorageMeter endpoint={`/e/${code}/manage/storage`} originalQuality={event.quality === "original"} googleAlbumUrl={event.googleAlbumUrl} />

        {tab === "share" && (
          <Card>
            <QRShare code={event.code} title={event.title} />
          </Card>
        )}
        {tab === "media" && <MediaManager code={code} feed={feed} albums={feed.albums} />}
        {tab === "albums" && <AlbumsManager event={event} onChanged={() => { load(); feed.reload(); }} />}
        {tab === "import" && event.isOwner && (
          <ImportFromGoogle code={code} albums={event.albums} quality={event.quality} onImported={() => { load(); feed.reload(); }} />
        )}
        {tab === "design" && <DesignTab event={event} onChanged={load} />}
        {tab === "music" && <MusicTab event={event} onChanged={load} />}
        {tab === "settings" && <SettingsForm event={event} onChanged={load} />}
      </main>
    </div>
  );
}
