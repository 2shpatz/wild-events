import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Cake, Heart, PartyPopper, Sparkles, Users, Settings, X } from "lucide-react";
import { useMe } from "../lib/session";
import { api, errorMessage } from "../lib/api";
import { applyTheme, backgroundProps, EVENT_TYPES, isDarkBackground } from "../lib/themes";
import type { EventType, PublicEvent, Quality } from "../../shared/types";
import { Stepper } from "../components/Stepper";
import { Button, Card, Field, Spinner, cx, inputClass, useToast } from "../components/ui";
import { BackgroundPicker, compressBackground } from "../components/ThemePicker";
import { QualityPicker } from "../components/QualityPicker";
import { InvitationEditor } from "../components/InvitationEditor";
import { QRShare } from "../components/QRShare";
import { EventTitle } from "../components/EventChrome";
import { SlugField, type SlugState } from "../components/SlugField";
import { TimeField } from "../components/TimeField";
import { suggestSlug } from "../../shared/slug";
import { defaultDesign } from "../../shared/design";
import { StorageAccountPicker } from "../components/StorageAccountPicker";
import { clearDraft, loadDraft, saveDraft } from "../lib/wizardDraft";

const STEPS = ["סוג האירוע", "פרטים", "עיצוב", "איכות העלאה", "אחסון התמונות", "שיתוף"];
const STORAGE_STEP = 4;
const SHARE_STEP = 5;

const ACCOUNT_ERRORS: Record<string, string> = {
  denied: "החיבור בוטל ב-Google. אפשר לנסות שוב.",
  scopes: "כדי לשמור תמונות בחשבון צריך לסמן את כל תיבות ההרשאה במסך של Google. נסו שוב.",
};

interface DraftFields {
  type: EventType;
  title: string;
  subtitle: string;
  date: string;
  time: string;
  venueName: string;
  venueAddress: string;
  code: string;
  codeTouched: boolean;
  password: string;
  advanced: boolean;
  background: string | null;
  quality: Quality;
  welcome: string;
  featuredSlots: number[];
}
const ICONS: Record<EventType, React.ReactNode> = {
  wedding: <Heart className="size-8" aria-hidden />,
  birthday: <Cake className="size-8" aria-hidden />,
  family: <Users className="size-8" aria-hidden />,
  party: <PartyPopper className="size-8" aria-hidden />,
  general: <Sparkles className="size-8" aria-hidden />,
};

export default function CreateEventWizard() {
  const { me } = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<EventType>("wedding");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [background, setBackground] = useState<string | null>(null);
  const [customFile, setCustomFile] = useState<Blob | null>(null);
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>("compressed");
  const [welcome, setWelcome] = useState("");
  const [header, setHeader] = useState<{ blob: Blob; src: string } | null>(null);
  const [invitation, setInvitation] = useState<{ blob: Blob; src: string } | null>(null);
  const [featured, setFeatured] = useState<{ slot: number; blob: Blob; src: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  const [codeState, setCodeState] = useState<SlugState>("idle");
  const [codeTouched, setCodeTouched] = useState(false);
  const [storageId, setStorageId] = useState<string | null>(null);
  const [storagePersonal, setStoragePersonal] = useState(false);
  const [personalAck, setPersonalAck] = useState(false);
  const [params, setParams] = useSearchParams();

  // Back from connecting a Google account: restore everything the owner already filled in.
  useEffect(() => {
    if (params.get("resume") !== "1") return;
    const connected = params.get("connected");
    const self = params.get("account") === "self";
    const err = params.get("account_error");
    setParams({}, { replace: true });
    (async () => {
      const d = await loadDraft<DraftFields>();
      await clearDraft();
      if (d) {
        const f = d.fields;
        const url = (b: Blob) => URL.createObjectURL(b);
        setType(f.type);
        setTitle(f.title);
        setSubtitle(f.subtitle);
        setDate(f.date);
        setTime(f.time);
        setVenueName(f.venueName);
        setVenueAddress(f.venueAddress);
        setCodeTouched(f.codeTouched);
        setCode(f.code);
        setPassword(f.password);
        setAdvanced(f.advanced);
        setQuality(f.quality);
        setWelcome(f.welcome);
        const bgBlob = d.blobs.custom;
        if (f.background === "custom" && bgBlob) {
          setCustomFile(bgBlob);
          setCustomPreview(url(bgBlob));
          setBackground("custom");
        } else setBackground(f.background === "custom" ? null : f.background);
        if (d.blobs.header) setHeader({ blob: d.blobs.header, src: url(d.blobs.header) });
        if (d.blobs.invitation) setInvitation({ blob: d.blobs.invitation, src: url(d.blobs.invitation) });
        setFeatured(f.featuredSlots.flatMap((slot) => (d.blobs[`f${slot}`] ? [{ slot, blob: d.blobs[`f${slot}`], src: url(d.blobs[`f${slot}`]) }] : [])));
        setStep(STORAGE_STEP);
      }
      if (connected) {
        setStorageId(connected);
        toast("החשבון חובר ונבחר לאירוע", "success");
      } else if (self) {
        toast("זה החשבון שאיתו נכנסת לאתר, והוא כבר מופיע ברשימה. כדי לשמור בנפרד צריך לבחור חשבון אחר אצל Google.", "info");
      } else if (err) {
        toast(ACCOUNT_ERRORS[err] || "לא הצלחנו לחבר את החשבון. אפשר לנסות שוב.", "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keepDraft = async () => {
    const blobs: Record<string, Blob> = {};
    if (background === "custom" && customFile) blobs.custom = customFile;
    if (header) blobs.header = header.blob;
    if (invitation) blobs.invitation = invitation.blob;
    for (const f of featured) blobs[`f${f.slot}`] = f.blob;
    await saveDraft<DraftFields>(
      {
        type,
        title,
        subtitle,
        date,
        time,
        venueName,
        venueAddress,
        code,
        codeTouched,
        password,
        advanced,
        background,
        quality,
        welcome,
        featuredSlots: featured.map((f) => f.slot),
      },
      blobs,
    );
  };

  useEffect(() => {
    if (me && !me.owner) navigate("/login?next=/dashboard/new", { replace: true });
  }, [me, navigate]);
  const theme = EVENT_TYPES.find((t) => t.id === type)!.theme;
  useEffect(() => applyTheme(theme), [theme]);

  // Address follows the event name until the owner edits it.
  useEffect(() => {
    if (!codeTouched) setCode(suggestSlug(title));
  }, [title, codeTouched]);

  const preview: PublicEvent = useMemo(
    () => ({
      id: "preview",
      code: "preview",
      title: title || "שם האירוע",
      subtitle: subtitle || null,
      welcome: welcome || null,
      date: date || null,
      time: time || null,
      venueName: venueName || null,
      venueAddress: venueAddress || null,
      type,
      theme,
      background: background === "custom" ? null : background,
      bgVersion: null,
      headerVersion: null,
      invitationVersion: null,
      featured: [],
      images: [],
      design: defaultDesign(),
      music: null,
      quality,
      keepGps: false,
      defaultView: "masonry",
      defaultOrder: "mixed",
      uploadsOpen: true,
      mediaCount: 0,
      albumCount: 0,
      canManage: false,
      isOwner: true,
    }),
    [title, subtitle, welcome, date, time, venueName, venueAddress, type, theme, background, quality],
  );

  if (!me?.owner) return <Spinner className="min-h-dvh" />;

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string; code: string }>("/owner/events", {
        method: "POST",
        json: {
          title,
          subtitle,
          welcome,
          date,
          time,
          venueName,
          venueAddress,
          type,
          theme,
          background: background === "custom" ? null : background,
          quality,
          adminPassword: password || undefined,
          code: code || undefined,
          storageAccountId: storageId,
        },
      });
      if (background === "custom" && customFile) {
        await api(`/e/${r.code}/manage/background`, { method: "PUT", body: customFile, headers: { "Content-Type": "image/jpeg" } }).catch(() =>
          toast("האירוע נוצר, אבל תמונת הרקע לא נשמרה. אפשר להעלות אותה שוב בהגדרות.", "error"),
        );
      }
      const put = (path: string, blob: Blob) => api(`/e/${r.code}/manage/${path}`, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      try {
        if (header) await put("header", header.blob);
        if (invitation) await put("invitation", invitation.blob);
        for (const f of featured) await put(`featured/${f.slot}`, f.blob);
      } catch {
        toast("האירוע נוצר, אבל חלק מהתמונות לא נשמרו. אפשר להוסיף אותן בהגדרות.", "error");
      }
      setCreated(r);
      setStep(SHARE_STEP);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const canNext = step === 0 || (step === 1 && title.trim() && (codeState === "ok" || !code) && (!password || password.length >= 4)) || step === 2 || step === 3;
  const canCreate = !!storageId && (!storagePersonal || personalAck);
  const bg = backgroundProps(preview);
  const dark = background === "custom" ? true : isDarkBackground(preview.background, theme);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-bold">אירוע חדש</h1>
          {!created && (
            <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-semibold text-muted-fg hover:bg-fg/5">
              <X className="size-5" aria-hidden />
              ביטול
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
        <main className="min-w-0 space-y-6">
          <Stepper steps={STEPS} current={step} />

          {step === 0 && (
            <section className="space-y-4">
              <h2 className="text-2xl font-bold">איזה אירוע חוגגים?</h2>
              <div role="radiogroup" aria-label="סוג האירוע" className="grid gap-3 sm:grid-cols-2">
                {EVENT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={type === t.id}
                    onClick={() => {
                      setType(t.id);
                      setBackground(null);
                    }}
                    data-theme={t.theme}
                    className={cx(
                      "flex items-center gap-4 rounded-2xl border-2 bg-bg p-5 text-start text-fg transition-[border-color,box-shadow] duration-200",
                      type === t.id ? "border-primary shadow-lift" : "border-border hover:border-primary/50",
                    )}
                  >
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">{ICONS[t.id]}</span>
                    <span>
                      <span className="block font-display text-2xl">{t.label}</span>
                      <span className="text-sm text-muted-fg">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 1 && (
            <Card className="space-y-5">
              <h2 className="text-2xl font-bold">פרטי האירוע</h2>
              <Field label="שם האירוע" htmlFor="ev-title" hint="יופיע בראש העמוד ובאלבום ב-Google Photos">
                <input id="ev-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: החתונה של נועה ואיתי" maxLength={80} autoFocus />
              </Field>
              <SlugField
                value={code}
                onChange={(v) => {
                  setCodeTouched(true);
                  setCode(v);
                }}
                onState={setCodeState}
              />
              <Field label="שורת משנה (לא חובה)" htmlFor="ev-sub">
                <input id="ev-sub" className={inputClass} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="למשל: מתחתנים!" maxLength={120} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="תאריך (לא חובה)" htmlFor="ev-date">
                  <input id="ev-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="שעה (לא חובה)" htmlFor="ev-time">
                  <TimeField id="ev-time" value={time} onChange={setTime} />
                </Field>
              </div>
              <Field label="שם המקום (לא חובה)" htmlFor="ev-venue">
                <input id="ev-venue" className={inputClass} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="למשל: אולמי הגן" maxLength={80} />
              </Field>
              <Field label="כתובת (לא חובה)" htmlFor="ev-addr" hint="הכתובת תופיע לאורחים עם כפתורי ניווט ב-Waze ובמפות">
                <input id="ev-addr" className={inputClass} value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} placeholder="למשל: הרצל 10, תל אביב" maxLength={160} autoComplete="street-address" />
              </Field>
              <button onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary">
                <Settings className="size-4" aria-hidden />
                הגדרות מתקדמות (לא חובה)
              </button>
              {advanced && (
                <div className="space-y-5 rounded-2xl bg-muted p-4">
                  <Field label="סיסמת ניהול לשותפים" htmlFor="ev-pass" hint="מי שיש לו את הסיסמה יוכל לנהל את האירוע בלי חשבון Google (למשל בן/בת הזוג או הצלם). לפחות 4 תווים.">
                    <input id="ev-pass" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={4} />
                  </Field>
                </div>
              )}
            </Card>
          )}

          {step === 2 && (
            <Card className="space-y-4">
              <h2 className="text-2xl font-bold">בוחרים רקע</h2>
              <p className="text-muted-fg">אפשר רקע מוכן שמתאים לאירוע, או תמונה שלכם (למשל תמונת זוג). אפשר לשנות גם אחר כך.</p>
              <BackgroundPicker
                type={type}
                value={background ?? EVENT_TYPES.find((t) => t.id === type)!.backgrounds[0].id}
                customPreview={customPreview}
                onPreset={(id) => setBackground(id)}
                onCustom={async (f) => {
                  try {
                    const blob = await compressBackground(f);
                    setCustomFile(blob);
                    setCustomPreview(URL.createObjectURL(blob));
                    setBackground("custom");
                  } catch {
                    toast("לא הצלחנו לקרוא את התמונה. נסו תמונה אחרת.", "error");
                  }
                }}
                onClearCustom={() => {
                  setCustomFile(null);
                  setCustomPreview(null);
                  setBackground(null);
                }}
              />
            </Card>
          )}

          {step === 2 && (
            <Card className="space-y-4">
              <h2 className="text-2xl font-bold">דף הכניסה - כמו הזמנה</h2>
              <p className="text-muted-fg">הכל לא חובה, ואפשר להוסיף גם אחר כך.</p>
              <InvitationEditor
                header={header?.src ?? null}
                onHeader={async (f) => {
                  try {
                    const blob = await compressBackground(f, 1600);
                    setHeader({ blob, src: URL.createObjectURL(blob) });
                  } catch {
                    toast("לא הצלחנו לקרוא את התמונה. נסו תמונה אחרת.", "error");
                  }
                }}
                onClearHeader={() => setHeader(null)}
                invitation={invitation?.src ?? null}
                onInvitation={async (f) => {
                  try {
                    const blob = await compressBackground(f, 2200);
                    setInvitation({ blob, src: URL.createObjectURL(blob) });
                  } catch {
                    toast("לא הצלחנו לקרוא את התמונה. נסו תמונה אחרת.", "error");
                  }
                }}
                onClearInvitation={() => setInvitation(null)}
                featured={featured}
                onAddFeatured={async (files) => {
                  const next = [...featured];
                  for (const f of files) {
                    const used = new Set(next.map((x) => x.slot));
                    const slot = [0, 1, 2, 3, 4, 5].find((i) => !used.has(i));
                    if (slot === undefined) break;
                    try {
                      const blob = await compressBackground(f, 1600);
                      next.push({ slot, blob, src: URL.createObjectURL(blob) });
                    } catch {
                      /* skip unreadable file */
                    }
                  }
                  setFeatured(next);
                }}
                onRemoveFeatured={(slot) => setFeatured((p) => p.filter((x) => x.slot !== slot))}
                welcome={welcome}
                onWelcome={setWelcome}
              />
            </Card>
          )}

          {step === 3 && (
            <Card className="space-y-4">
              <h2 className="text-2xl font-bold">באיזו איכות לשמור את התמונות?</h2>
              <QualityPicker value={quality} onChange={setQuality} />
            </Card>
          )}

          {step === STORAGE_STEP && (
            <Card className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold">איפה נשמור את התמונות?</h2>
                <p className="text-muted-fg">
                  כל התמונות והסרטונים של האורחים נשמרים ב-Google Photos של החשבון שתבחרו. לחשבון Google חינמי יש 15GB, משותפים ל-Gmail,
                  ל-Drive ולתמונות. אפשר להעביר את האירוע לחשבון אחר גם אחר כך.
                </p>
              </div>
              <StorageAccountPicker
                value={storageId}
                onChange={(id, a) => {
                  setStorageId(id);
                  setStoragePersonal(a.personal);
                  if (!a.personal) setPersonalAck(false);
                }}
                quality={quality}
                personalAck={personalAck}
                onPersonalAck={setPersonalAck}
                connectNext="/dashboard/new?resume=1"
                onBeforeConnect={keepDraft}
                label="בוחרים חשבון לאירוע"
              />
            </Card>
          )}

          {step === SHARE_STEP && created && (
            <Card className="space-y-5">
              <div className="text-center">
                <h2 className="text-2xl font-bold">האירוע מוכן!</h2>
                <p className="text-muted-fg">שלחו את הקישור לאורחים בוואטסאפ, או הדפיסו את ה-QR לשולחנות.</p>
              </div>
              <QRShare code={created.code} title={title} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Button size="lg" onClick={() => navigate(`/${created.code}/manage`)}>
                  לניהול האירוע
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate(`/${created.code}`)}>
                  לראות את העמוד של האורחים
                </Button>
              </div>
            </Card>
          )}

          {step === STORAGE_STEP && !canCreate && (
            <p className="text-center text-base font-semibold text-muted-fg" role="status">
              {!storageId ? "בוחרים חשבון Google לאירוע כדי להמשיך" : "כדי להמשיך עם החשבון הפרטי צריך לסמן שהבנת את האזהרה"}
            </p>
          )}
          {step < SHARE_STEP && (
            <div className="flex justify-between gap-3">
              <Button variant="ghost" size="lg" disabled={step === 0} onClick={() => setStep((s) => s - 1)} icon={<ArrowRight className="size-5" aria-hidden />}>
                חזרה
              </Button>
              {step < STORAGE_STEP ? (
                <Button size="lg" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                  המשך
                  <ArrowLeft className="size-5" aria-hidden />
                </Button>
              ) : (
                <Button size="lg" variant="accent" loading={busy} disabled={!canCreate} onClick={create}>
                  יצירת האירוע
                </Button>
              )}
            </div>
          )}
        </main>

        {/* Live preview of the guest page. */}
        <aside className="hidden lg:block" aria-label="תצוגה מקדימה">
          <div className="sticky top-6 space-y-2">
            <p className="text-sm font-semibold text-muted-fg">כך זה ייראה לאורחים</p>
            <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] border-8 border-zinc-900 shadow-lift">
              <div
                className={cx("absolute inset-0", background === "custom" ? "bg-cover bg-center" : bg.className)}
                style={background === "custom" && customPreview ? { backgroundImage: `url(${customPreview})` } : bg.style}
              />
              {background === "custom" && <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/75" />}
              <div className={cx("relative flex h-full flex-col justify-center gap-6 p-5", dark ? "text-white" : "text-fg")}>
                <div className="origin-center scale-[0.72]">
                  <EventTitle event={preview} />
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl bg-accent px-4 py-3 text-center font-bold text-on-accent">העלאת תמונות</div>
                  <div className={cx("rounded-2xl border-2 px-4 py-3 text-center font-bold", dark ? "border-white/50" : "border-primary bg-card/70")}>צפייה באלבום</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
