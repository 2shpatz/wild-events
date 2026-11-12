// Dashboard note for users who don't host the site: who runs this copy, and how to get a free copy of your own.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Eye, EyeOff, Gift } from "lucide-react";
import type { SiteOperator } from "../../shared/types";
import { CF_WORKERS_URL, GUIDE_URL, REPO_URL } from "../lib/links";
import { Button, Card, LinkButton, Modal } from "./ui";

// The user can hide the note; remembered on this device only.
const HIDDEN_KEY = "lea:ownSiteNote:hidden";
function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}
function writeHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY, "1");
    else localStorage.removeItem(HIDDEN_KEY);
  } catch {
    // Storage blocked (private mode): the choice lasts until the page reloads.
  }
}

export function OwnSiteNote({ operator }: { operator: SiteOperator }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(readHidden);
  // After hide/show, keep keyboard focus on the button that brings the other state back.
  const toggled = useRef(false);
  const showRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!toggled.current) return;
    (hidden ? showRef : hideRef).current?.focus();
  }, [hidden]);
  const toggle = (next: boolean) => {
    toggled.current = true;
    writeHidden(next);
    setHidden(next);
  };

  if (hidden) {
    return (
      <button
        ref={showRef}
        type="button"
        onClick={() => toggle(false)}
        className="inline-flex min-h-11 select-none items-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 text-base font-semibold text-emerald-900 transition-colors duration-200 hover:bg-emerald-100 active:bg-emerald-200"
      >
        <Eye className="size-5 shrink-0" aria-hidden />
        הצגת ההודעה: אתר משלכם, בחינם
      </button>
    );
  }

  return (
    <>
      <Card className="flex flex-col gap-4 border-2 border-emerald-500 bg-emerald-50 text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-white" aria-hidden>
            <Gift className="size-6" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-bold">
              {operator.name || operator.email ? (
                <>
                  האתר הזה בניהול {operator.name && <bdi>{operator.name}</bdi>}
                  {operator.email && (
                    <>
                      {operator.name && " ("}
                      <a href={`mailto:${operator.email}`} className="break-all underline underline-offset-2">
                        <bdi dir="ltr">{operator.email}</bdi>
                      </a>
                      {operator.name && ")"}
                    </>
                  )}
                </>
              ) : (
                "האתר הזה בניהול של מי שהתקין אותו"
              )}
            </p>
            <p className="text-base">רוצים להיות הבעלים של אתר זהה, בחינם?</p>
          </div>
        </div>
        {/* Own classes rather than <Button>: its variants set colors that cx() can't override reliably. */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 flex-1 select-none items-center justify-center rounded-xl bg-emerald-700 px-5 text-base font-semibold text-white shadow-soft transition-colors duration-200 hover:bg-emerald-800 active:bg-emerald-900 sm:flex-none"
          >
            לחצו כאן להסבר איך
          </button>
          <button
            ref={hideRef}
            type="button"
            onClick={() => toggle(true)}
            className="inline-flex min-h-11 select-none items-center justify-center gap-1.5 rounded-xl px-3 text-base font-semibold text-emerald-900 transition-colors duration-200 hover:bg-emerald-100 active:bg-emerald-200"
          >
            <EyeOff className="size-5 shrink-0" aria-hidden />
            הסתרה
          </button>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="אתר משלכם, בחינם"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              סגירה
            </Button>
            <LinkButton href={GUIDE_URL} target="_blank" rel="noopener noreferrer" variant="primary" icon={<ExternalLink className="size-4" aria-hidden />}>
              למדריך המלא
            </LinkButton>
          </>
        }
      >
        <div className="space-y-5 text-base leading-relaxed">
          <p>
            הקוד של האתר פתוח וחינמי. מתקינים עותק משלכם, בחשבונות שלכם, ומקבלים אתר זהה שאתם מנהלים: האתר רץ בחשבון Cloudflare שלכם
            (תוכנית חינמית) והתמונות נשמרות ב-Google שלכם. זה לוקח כ-25 דקות, פעם אחת.
          </p>

          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="font-semibold">מה צריך:</p>
            <p>
              חשבונות חינמיים ב-
              <Ext href="https://github.com/signup">GitHub</Ext>, ב-<Ext href="https://dash.cloudflare.com/sign-up">Cloudflare</Ext> וב-Google.
            </p>
          </div>

          <ol className="space-y-4">
            <Step n={1} title="מושכים עותק של הקוד (Fork)">
              נכנסים לעמוד הקוד ב-<Ext href={REPO_URL}>GitHub</Ext>, לוחצים <b dir="ltr">Fork</b> ואז <b dir="ltr">Create fork</b>. העותק
              נשאר בחשבון שלכם, ולא צריך לעדכן אותו אף פעם: האתר לוקח לבד את הגרסה החדשה ביותר.
            </Step>
            <Step n={2} title="מחברים את העותק ל-Cloudflare">
              ב-<Ext href={CF_WORKERS_URL}>Workers &amp; Pages</Ext> לוחצים <b dir="ltr">Create application</b>, בוחרים GitHub ואת העותק{" "}
              <code dir="ltr" className="whitespace-nowrap">wild-events</code>. ב-Deploy command כותבים <code dir="ltr" className="whitespace-nowrap">npm run deploy</code> ולוחצים{" "}
              <b dir="ltr">Save and Deploy</b>. הבנייה לוקחת כ-3 דקות.
            </Step>
            <Step n={3} title="שומרים את קישור ההגדרה">
              בסוף יומן הבנייה מופיעה מסגרת <b dir="ltr">YOUR SITE IS READY</b> עם קישור וקוד ההגדרה. שומרים אותם במקום בטוח: הם מוצגים רק פעם
              אחת, ומי שמחזיק בהם הוא מנהל/ת האתר.
            </Step>
            <Step n={4} title="מתחילים את אשף הטמעת האתר">
              פותחים את קישור ההגדרה במחשב. האשף בעברית ומלווה אתכם בכל לחיצה (כ-15 דקות): פרטי מפעיל האתר, חיבור ל-Google ובדיקה שהכל
              עובד. חשבון ה-Google שאיתו בודקים הופך למנהל/ת האתר. אפשר לעצור באמצע ולחזור.
            </Step>
            <Step n={5} title="יוצרים אירוע ראשון">
              נכנסים לאתר החדש, מתחברים עם Google ויוצרים אירוע. גרסאות חדשות מותקנות לבד, בלילה שאחרי שהן יוצאות.
            </Step>
          </ol>

          <p className="text-sm text-muted-fg">
            מעדיפים להתקין מהמחשב, בלי GitHub? יש גם דרך כזו, וכל הפרטים במדריך המלא. מי שמתקין עותק הוא הבעלים והמפעיל שלו, ואחראי על השימוש
            בו.
          </p>
        </div>
      </Modal>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 font-bold text-white" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 space-y-1">
        <h3 className="font-bold">
          <span className="sr-only">שלב {n}: </span>
          {title}
        </h3>
        <p>{children}</p>
      </div>
    </li>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-2">
      {children}
      <span className="sr-only"> (נפתח בלשונית חדשה)</span>
    </a>
  );
}
