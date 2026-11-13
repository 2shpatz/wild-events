import { useState } from "react";
import { ArrowLeft, ArrowRight, FileSpreadsheet, Sparkles } from "lucide-react";
import { DEFAULT_CIRCLES, defaultSides, tagsFrom, type PlannerConfig } from "../../../shared/guests";
import { Button, Card } from "../ui";
import { Stepper } from "../Stepper";
import { Toggle } from "../manage/Toggle";
import { usePlanner } from "./store";
import { TagEditor } from "./TagEditor";

const STEPS = ["בעלי השמחה", "מעגלי היכרות", "Google Sheets"];

/** First visit to the planner: 3 short steps; everything can be changed later in the settings. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { data, saveConfig, sync } = usePlanner();
  const [cfg, setCfg] = useState<PlannerConfig>(data.config);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const wedding = data.event.type === "wedding";
  const finish = async (createSheet: boolean) => {
    setBusy(true);
    const ok = await saveConfig({ ...cfg, onboarded: true });
    if (ok && createSheet) await sync({ create: true });
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <Card className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="size-6" aria-hidden />
        </span>
        <div>
          <h2 className="text-xl font-bold">בואו נכין את רשימת האורחים</h2>
          <p className="text-muted-fg">שלוש שאלות קצרות. אפשר לשנות הכול אחר כך בהגדרות.</p>
        </div>
      </div>
      <Stepper steps={STEPS} current={step} />
      <div className="mt-6 space-y-4">
        {step === 0 && (
          <>
            <p className="text-lg font-semibold">מי בעלי השמחה? לכל אורח נסמן של מי הוא (&quot;צד&quot;).</p>
            <p className="text-muted-fg">
              {wedding ? "למשל: צד הכלה וצד החתן, או השמות שלכם. " : ""}אפשר שניים או יותר, ו&quot;משותף&quot; לאורחים של כולם. מחליפים את השמות לשמות האמיתיים.
            </p>
            <Toggle
              checked={cfg.sides.length > 0}
              onChange={(v) => setCfg({ ...cfg, sides: v ? tagsFrom(defaultSides(data.event.type).length ? defaultSides(data.event.type) : ["צד א'", "צד ב'", "משותף"]) : [] })}
              label="לחלק את האורחים לצדדים"
              hint="כבוי = אין צדדים (מתאים ליום הולדת או טיול)"
            />
            {cfg.sides.length > 0 && <TagEditor tags={cfg.sides} onChange={(sides) => setCfg({ ...cfg, sides })} noun="צד" placeholder="עוד צד, למשל: צד סבתא" />}
          </>
        )}
        {step === 1 && (
          <>
            <p className="text-lg font-semibold">מאיפה מכירים את האורחים?</p>
            <p className="text-muted-fg">המעגלים עוזרים להושיב יחד חברים מאותה חבורה ולראות כמה הוזמנו מכל מעגל.</p>
            <TagEditor tags={cfg.circles} onChange={(circles) => setCfg({ ...cfg, circles })} noun="מעגל" placeholder="מעגל חדש, למשל: חוג ריקוד" suggestions={[...DEFAULT_CIRCLES, "משפחה מורחבת", "חברים מהילדות", "תנועת נוער", "קהילה"]} />
          </>
        )}
        {step === 2 && (
          <>
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-1 size-8 shrink-0 text-green-700" aria-hidden />
              <div className="space-y-2">
                <p className="text-lg font-semibold">לנהל את הרשימה גם ב-Google Sheets?</p>
                <p className="text-muted-fg">
                  ניצור גיליון בחשבון ה-Google של האירוע. כל שינוי כאן מופיע בגיליון וכל שינוי בגיליון מופיע כאן, כולל עמודות חדשות שתוסיפו. אישורי ההגעה של האורחים נכנסים לגיליון מעצמם.
                </p>
                <p className="text-sm text-muted-fg">אפשר גם לדלג ולחבר גיליון מאוחר יותר בהגדרות.</p>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="mt-8 flex flex-wrap-reverse items-center justify-between gap-3 border-t border-border pt-5">
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)} icon={<ArrowRight className="size-4" aria-hidden />} disabled={busy}>
              הקודם
            </Button>
          )}
          <Button variant="ghost" onClick={() => finish(false)} disabled={busy}>
            דילוג
          </Button>
        </div>
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)}>
            הבא
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => finish(false)} loading={busy}>
              לא עכשיו
            </Button>
            <Button onClick={() => finish(true)} loading={busy} icon={<FileSpreadsheet className="size-4" aria-hidden />}>
              יצירת גיליון
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
