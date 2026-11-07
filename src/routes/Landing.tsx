import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  CalendarDays,
  CalendarPlus,
  Camera,
  Cloud,
  CloudDownload,
  FolderPlus,
  Globe,
  Heart,
  Images,
  LayoutGrid,
  Link2,
  ListPlus,
  MapPin,
  MonitorPlay,
  MonitorSmartphone,
  Palette,
  QrCode,
  Radio,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Type,
  UserRound,
} from "lucide-react";
import { applyTheme } from "../lib/themes";
import { useMe } from "../lib/session";
import { Reveal } from "../components/Reveal";
import { GuestPageDemo } from "../components/landing/GuestPageDemo";
import { FONTS } from "../../shared/fonts";
// Real event photos, CC0 (StockSnap) - sources in src/assets/albums/CREDITS.md
import hosts320 from "../assets/albums/hosts-320.webp";
import hosts640 from "../assets/albums/hosts-640.webp";
import photographer320 from "../assets/albums/photographer-320.webp";
import photographer640 from "../assets/albums/photographer-640.webp";
import guest320 from "../assets/albums/guest-320.webp";
import guest640 from "../assets/albums/guest-640.webp";
import friends320 from "../assets/albums/friends-320.webp";
import friends640 from "../assets/albums/friends-640.webp";

/**
 * Site home. Pattern: Feature-Rich Showcase (design-system/live-event-albums/pages/landing.md):
 * Hero > Albums spotlight (the #1 feature) > Guest page design spotlight > other features > how it works > CTA.
 * No testimonials or stats - none are real yet.
 */
export default function Landing() {
  const { me } = useMe();
  useEffect(() => applyTheme("wedding"), []);
  const cta = me?.owner ? "/dashboard" : "/login";
  const ctaLabel = me?.owner ? "לאירועים שלי" : "יצירת אירוע בחינם";

  const albumPoints = [
    { icon: <UserRound className="size-6" aria-hidden />, title: "אלבום אישי לכל אורח", text: "כל אורח כותב את השם שלו פעם אחת, ומה שהוא מעלה נכנס אוטומטית לאלבום שלו." },
    { icon: <FolderPlus className="size-6" aria-hidden />, title: "אלבומים משלכם", text: "צלם האירוע, החינה, קבלת הפנים - פותחים אלבום, נותנים לו שם ומסדרים." },
    { icon: <Link2 className="size-6" aria-hidden />, title: "אלבום ששיתפו איתכם? מקשרים אותו", text: "האלבום של הצלם או של החברים ב-Google Photos מתחבר לאירוע כאלבום משלו. בלחיצה על \"עדכון\" נכנסות רק התמונות החדשות." },
    { icon: <CloudDownload className="size-6" aria-hidden />, title: "גם תמונות בודדות", text: "בוחרים תמונות שכבר נמצאות ב-Google Photos ומכניסים אותן לכל אלבום באירוע." },
    { icon: <LayoutGrid className="size-6" aria-hidden />, title: "צופים איך שרוצים", text: "בגלריה בוחרים: הכל מעורבב, לפי ציר זמן, או אלבום אחרי אלבום." },
    { icon: <Cloud className="size-6" aria-hidden />, title: "נשמר ב-Google Photos שלכם", text: "האלבומים נשמרים בחשבון שלכם, בחינם, ונשארים שלכם גם אחרי האירוע." },
  ];

  const hebrewFonts = FONTS.filter((f) => f.hebrew).length;
  const designPoints = [
    { icon: <Type className="size-6" aria-hidden />, title: "גופן מיוחד לכותרת", text: `${FONTS.length} גופנים לבחירה מ-Google Fonts, ומתוכם ${hebrewFonts} בעברית. מדפדפים בחצים ורואים את הכותרת מתחלפת בעמוד עצמו, גם בטלפון.` },
    { icon: <ListPlus className="size-6" aria-hidden />, title: "מוסיפים מה שרוצים", text: "טקסט, תמונות, פרטי האירוע, התמונות הנבחרות והאלבום החי, לפני העמוד הראשי או אחריו ובסדר שבחרתם." },
    { icon: <CalendarDays className="size-6" aria-hidden />, title: "התאריך בדרך שלכם", text: "כמו בהזמנה, בשורה אחת, במספרים, בתאריך עברי, או לועזי ועברי יחד." },
    { icon: <Palette className="size-6" aria-hidden />, title: "ערכת נושא וצבעים", text: "עיצובים לחתונה, יום הולדת, אירוע משפחתי ומסיבה, ועליהם צבע משלכם לכותרת ולטקסטים." },
    { icon: <MonitorSmartphone className="size-6" aria-hidden />, title: "רואים לפני ששומרים", text: "תצוגה חיה של העמוד בטלפון ובמחשב. האורחים רואים את השינויים רק אחרי שלוחצים \"שמירה\"." },
  ];

  const features = [
    { icon: <Globe className="size-6" aria-hidden />, title: "כתובת קצרה משלכם", text: "קישור ברור לאירוע עם שם שבחרתם, שקל לשלוח בוואטסאפ ולהדפיס על ההזמנה." },
    { icon: <QrCode className="size-6" aria-hidden />, title: "QR ושיתוף בוואטסאפ", text: "שולחים קישור או מדפיסים כרטיס QR לשולחנות. האורחים נכנסים בלי הרשמה ובלי אפליקציה." },
    { icon: <Smartphone className="size-6" aria-hidden />, title: "העלאה הכי פשוטה", text: "בוחרים מהגלריה וזהו, גם סרטונים. הקבצים נדחסים אוטומטית, ואפשר לבחור איכות מקורית." },
    { icon: <Radio className="size-6" aria-hidden />, title: "גלריה חיה", text: "גלילה, תמונות מרחפות, קרוסלה וקיר פסיפס. כל תמונה חדשה מופיעה אצל כולם תוך שניות." },
    { icon: <MonitorPlay className="size-6" aria-hidden />, title: "מצגת לאולם", text: "מסך מלא שמציג קודם את התמונות החדשות, עם QR להעלאה, מעולה למסך או למקרן." },
    { icon: <ShieldCheck className="size-6" aria-hidden />, title: "שליטה מלאה", text: "מסתירים תמונות, מקבלים אישור ברור לפני כל מחיקה, וכל אורח יכול למחוק רק את מה שהעלה מהטלפון שלו." },
  ];

  const steps = [
    { icon: <CalendarPlus className="size-7" aria-hidden />, title: "פותחים אירוע", text: "מתחברים עם Google, מעצבים את עמוד האורחים ומקבלים אלבום משותף." },
    { icon: <QrCode className="size-7" aria-hidden />, title: "משתפים את האורחים", text: "שולחים קישור בוואטסאפ או מניחים QR על השולחנות." },
    { icon: <Images className="size-7" aria-hidden />, title: "התמונות מתמלאות באלבומים", text: "כל אורח מעלה מהטלפון, וכולם רואים את האלבומים מתעדכנים בלייב." },
  ];

  return (
    <div className="bg-preset-wedding-blush min-h-dvh text-fg">
      <header className="mx-auto max-w-6xl px-5 pt-4">
        <div className="flex justify-end">
          <Link to={cta} className="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold transition-colors duration-200 hover:bg-fg/5">
            {me?.owner ? "האירועים שלי" : "כניסה"}
          </Link>
        </div>
        {/* Brand: big centered logo, wordmark underneath */}
        <Reveal variant="scale" className="flex flex-col items-center gap-3 text-center sm:gap-4">
          <img
            src="/logo-hero.webp"
            alt=""
            width={192}
            height={192}
            fetchPriority="high"
            className="size-36 drop-shadow-xl sm:size-48"
          />
          <p className="brand-wordmark whitespace-nowrap text-[clamp(3rem,14.5vw,8rem)]">
            אירוע פרוע
            <span aria-hidden className="brand-sparkle">
              אירוע פרוע
            </span>
            <BrandStars />
          </p>
        </Reveal>
      </header>

      <main>
        {/* Hero: what this site is */}
        <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-5 pb-16 pt-8 text-center sm:pt-10">
          <Reveal variant="fade">
            <span className="inline-flex items-center gap-2 rounded-full bg-card/80 px-4 py-1.5 text-sm font-semibold text-primary shadow-soft backdrop-blur">
              <Heart className="size-4" aria-hidden />
              דף הבית של האירועים
            </span>
          </Reveal>
          <Reveal variant="scale">
            <h1 className="font-display text-5xl leading-tight [text-wrap:balance] sm:text-7xl">הבית של כל האירועים שלכם</h1>
          </Reveal>
          <Reveal variant="up" delay={150}>
            <p className="max-w-2xl text-xl text-muted-fg [text-wrap:balance]">
              כאן פותחים אירוע, מעצבים לו עמוד אורחים משלכם, מזמינים את האורחים, וכל התמונות מתרכזות באלבומים משותפים שמתעדכנים בלייב. חתונה, יום הולדת, בר מצווה או כל אירוע אחר.
            </p>
          </Reveal>
          <Reveal variant="up" delay={300} className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Link
              to={cta}
              className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-accent px-8 text-xl font-bold text-on-accent shadow-lift transition-[filter] duration-200 hover:brightness-110 sm:w-auto"
            >
              <Camera className="size-6" aria-hidden />
              {ctaLabel}
            </Link>
            <a
              href="#albums"
              className="inline-flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary/30 bg-card/70 px-7 text-lg font-bold backdrop-blur transition-colors duration-200 hover:bg-card sm:w-auto"
            >
              <ArrowDown className="size-5" aria-hidden />
              מה יש כאן
            </a>
          </Reveal>
          <Reveal variant="fade" delay={450}>
            <p className="inline-flex items-center gap-2 text-muted-fg">
              <ScanLine className="size-5 shrink-0" aria-hidden />
              הגעתם בתור אורחים? פתחו את הקישור או סרקו את ה-QR שקיבלתם מבעלי האירוע.
            </p>
          </Reveal>
        </section>

        {/* Albums spotlight: the main feature */}
        <section id="albums" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-20" aria-labelledby="albums-title">
          <div className="grid items-center gap-10 rounded-[2rem] bg-card/85 p-6 shadow-lift backdrop-blur sm:p-10 lg:grid-cols-2">
            <div>
              <span className="text-sm font-bold text-primary">הדבר הכי חשוב</span>
              <h2 id="albums-title" className="mt-1 font-display text-4xl leading-tight sm:text-5xl">
                האלבומים - הלב של האירוע
              </h2>
              <p className="mt-3 text-lg text-muted-fg">כל התמונות מכל האורחים, מסודרות באלבומים, במקום אחד.</p>
              <ul className="mt-7 space-y-5">
                {albumPoints.map((p, i) => (
                  <Reveal as="li" key={p.title} variant="start" delay={i * 90} className="flex gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">{p.icon}</span>
                    <div>
                      <h3 className="text-lg font-bold">{p.title}</h3>
                      <p className="text-muted-fg">{p.text}</p>
                    </div>
                  </Reveal>
                ))}
              </ul>
            </div>
            <Reveal as="figure" variant="scale" delay={150}>
              <AlbumsIllustration />
            </Reveal>
          </div>
        </section>

        {/* Guest page design spotlight: second feature, mirrored layout (demo on the start side on desktop) */}
        <section id="design" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-20" aria-labelledby="design-title">
          <div className="grid items-center gap-10 rounded-[2rem] bg-card/85 p-6 shadow-lift backdrop-blur sm:p-10 lg:grid-cols-2">
            <div className="lg:order-last">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-bold text-on-accent">
                <Sparkles className="size-4" aria-hidden />
                חדש
              </span>
              <h2 id="design-title" className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
                עמוד האורחים בעיצוב שלכם
              </h2>
              <p className="mt-3 text-lg text-muted-fg">בונים את העמוד שהאורחים פותחים, כמו הזמנה, עם תצוגה חיה של כל שינוי.</p>
              <ul className="mt-7 space-y-5">
                {designPoints.map((p, i) => (
                  <Reveal as="li" key={p.title} variant="end" delay={i * 90} className="flex gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">{p.icon}</span>
                    <div>
                      <h3 className="text-lg font-bold">{p.title}</h3>
                      <p className="text-muted-fg">{p.text}</p>
                    </div>
                  </Reveal>
                ))}
              </ul>
            </div>
            <Reveal variant="scale" delay={150}>
              <GuestPageDemo />
            </Reveal>
          </div>
        </section>

        {/* Everything else */}
        <section className="mx-auto max-w-6xl px-5 pb-20" aria-labelledby="features">
          <h2 id="features" className="mb-8 text-center text-3xl font-bold">ועוד הכל מה שצריך לאירוע</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal as="li" key={f.title} variant="fade" delay={(i % 3) * 100} className="flex gap-4 rounded-2xl bg-card/75 p-5 shadow-soft backdrop-blur">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{f.icon}</span>
                <div>
                  <h3 className="font-bold">{f.title}</h3>
                  <p className="text-muted-fg">{f.text}</p>
                </div>
              </Reveal>
            ))}
            <Reveal as="li" variant="fade" className="flex gap-4 rounded-2xl bg-card/75 p-5 shadow-soft backdrop-blur sm:col-span-2 lg:col-span-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="size-6" aria-hidden />
              </span>
              <div>
                <h3 className="font-bold">ניווט, כתובת ויומן</h3>
                <p className="text-muted-fg">כפתורי Waze, Google Maps ו-Apple Maps, שיתוף הכתובת בוואטסאפ והוספת האירוע ליומן.</p>
              </div>
            </Reveal>
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20" aria-labelledby="how">
          <h2 id="how" className="mb-8 text-center text-3xl font-bold">איך זה עובד</h2>
          <ol className="grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} variant="up" delay={i * 120} className="rounded-3xl bg-card/85 p-7 shadow-soft backdrop-blur">
                <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-on-primary">{s.icon}</span>
                <h3 className="text-xl font-bold">
                  {i + 1}. {s.title}
                </h3>
                <p className="mt-2 text-muted-fg">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="px-5 pb-24 text-center">
          <Reveal variant="scale" className="mx-auto max-w-3xl rounded-[2rem] bg-primary px-8 py-12 text-on-primary shadow-lift">
            <h2 className="font-display text-4xl">מוכנים לאירוע?</h2>
            <p className="mt-3 text-lg opacity-90">כמה דקות של הגדרה, ויש לכם אלבום משותף לכל האורחים.</p>
            <Link to={cta} className="mt-6 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-7 text-lg font-bold text-zinc-900 transition-[filter] duration-200 hover:brightness-95">
              <CalendarPlus className="size-5" aria-hidden />
              {me?.owner ? "לאירועים שלי" : "מתחילים עכשיו"}
            </Link>
          </Reveal>
        </section>
      </main>

    </div>
  );
}

/** Decorative twinkling stars around the wordmark (positions in % of the wordmark box, size in em). */
function BrandStars() {
  const stars = [
    { top: "-14%", right: "-5%", s: 1, color: "#ffd166", d: "0s" },
    { top: "60%", right: "-8%", s: 0.5, color: "#ffffff", d: "0.5s" },
    { top: "-20%", right: "24%", s: 0.55, color: "#ffd166", d: "0.9s" },
    { top: "78%", right: "47%", s: 0.45, color: "#ffffff", d: "0.3s" },
    { top: "-10%", right: "97%", s: 0.85, color: "#ffffff", d: "0.7s" },
    { top: "66%", right: "100%", s: 0.5, color: "#ffd166", d: "1.1s" },
  ];
  return (
    <>
      {stars.map((st, i) => (
        <svg
          key={i}
          aria-hidden
          viewBox="0 0 24 24"
          className="brand-star"
          style={{ top: st.top, right: st.right, fill: st.color, ["--s" as string]: st.s, ["--d" as string]: st.d }}
        >
          <path d="M12 1C13 8 16 11 23 12C16 13 13 16 12 23C11 16 8 13 1 12C8 11 11 8 12 1Z" />
        </svg>
      ))}
    </>
  );
}

/** Decorative preview of the gallery "albums" screen, with real (CC0) event photos as covers. No real data, no invented counts. */
function AlbumsIllustration() {
  const albums = [
    { name: "בעלי השמחה", kind: "אלבום המארחים", src: hosts320, srcSet: `${hosts320} 320w, ${hosts640} 640w`, pos: "object-top" },
    { name: "צלם האירוע", kind: "אלבום שפתחתם", src: photographer320, srcSet: `${photographer320} 320w, ${photographer640} 640w`, pos: "object-center" },
    { name: "נועה", kind: "אלבום של אורחת", src: guest320, srcSet: `${guest320} 320w, ${guest640} 640w`, pos: "object-center" },
    { name: "החברים של יואב", kind: "אלבום של אורחים", src: friends320, srcSet: `${friends320} 320w, ${friends640} 640w`, pos: "object-center" },
  ];
  return (
    <div role="img" aria-label="דוגמה למסך האלבומים באירוע: אלבום המארחים, אלבום הצלם ואלבום לכל אורח" className="rounded-3xl bg-zinc-950 p-4 text-white shadow-lift sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2.5 font-bold">
          <img src={hosts320} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full object-cover object-[45%_35%] ring-2 ring-pink-300/70" />
          <span className="truncate">החתונה של דנה ויואב</span>
        </span>
        <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-sm">אלבומים</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        {albums.map((a, i) => (
          <div key={a.name}>
            {/* Two offset "pages" behind the cover make each tile read as an album, not a single photo */}
            <div className="relative mx-1.5 mt-2">
              <div aria-hidden className={`absolute inset-0 rounded-2xl bg-white/10 ${i % 2 ? "-rotate-3" : "rotate-3"}`} />
              <div aria-hidden className={`absolute inset-0 rounded-2xl bg-white/20 ${i % 2 ? "rotate-2" : "-rotate-2"}`} />
              <img
                src={a.src}
                srcSet={a.srcSet}
                sizes="(min-width: 1024px) 260px, 45vw"
                alt=""
                width={320}
                height={240}
                loading="lazy"
                decoding="async"
                className={`relative aspect-[4/3] w-full rounded-2xl object-cover shadow-lg ring-1 ring-white/15 ${a.pos}`}
              />
            </div>
            <div className="px-1.5 pt-2.5">
              <div className="truncate font-bold">{a.name}</div>
              <div className="truncate text-sm text-white/70">{a.kind}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
