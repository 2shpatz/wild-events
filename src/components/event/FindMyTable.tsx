import { useState } from "react";
import { Armchair, Search } from "lucide-react";
import { FIND_TABLE_TEXTS, partText, type FindTableBlock } from "../../../shared/design";
import type { PublicEvent } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { Button, cx, inputClass } from "../ui";
import { Reveal } from "../Reveal";
import { blockStyle } from "./EventBlocks";

type Answer = { published: boolean; matches: { name: string; table: string }[] };

/**
 * "Find my table": a guest types first + last name and sees their table. The server answers only when the hosts
 * published the seating, needs both names, and returns at most a few matches (name + table only).
 */
export function FindMyTable({ block, event, dark, preview }: { block: FindTableBlock; event: PublicEvent; dark: boolean; preview: boolean }) {
  const title = partText(block.texts, "title", FIND_TABLE_TEXTS.title);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) return;
    setError(null);
    if (first.trim().length < 2 || last.trim().length < 2) {
      setError("צריך לכתוב שם פרטי ושם משפחה (לפחות 2 אותיות בכל אחד).");
      return;
    }
    setBusy(true);
    try {
      setAnswer(await api<Answer>(`/e/${event.code}/find-table?first=${encodeURIComponent(first.trim())}&last=${encodeURIComponent(last.trim())}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const card = dark ? "bg-white/10" : "bg-card/85 shadow-soft";
  const field = cx(inputClass, dark && "border-white/30 bg-white/10 text-white placeholder:text-white/60");
  return (
    <section className="relative scroll-mt-10 px-5 py-14 sm:py-20" style={blockStyle(block)} aria-labelledby={`seat-title-${block.id}`}>
      <div className="mx-auto w-full max-w-xl">
        <Reveal variant="up">
          <h2 id={`seat-title-${block.id}`} className="mb-3 text-center font-title text-4xl [text-wrap:balance] sm:text-5xl">
            {title}
          </h2>
          <p className="mb-8 text-center text-lg opacity-85">{partText(block.texts, "text", FIND_TABLE_TEXTS.text)}</p>
        </Reveal>
        <Reveal variant="up" delay={100}>
          <form onSubmit={search} className={cx("space-y-4 rounded-[2rem] px-5 py-6 backdrop-blur-md sm:px-7", card)} data-preview-interactive>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold">שם פרטי</span>
                <input className={field} value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" maxLength={40} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold">שם משפחה</span>
                <input className={field} value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" maxLength={40} />
              </label>
            </div>
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={<Search className="size-5" aria-hidden />}>
              {partText(block.texts, "button", FIND_TABLE_TEXTS.button)}
            </Button>
            <div aria-live="polite" className="min-h-0">
              {error && (
                <p role="alert" className="font-semibold text-destructive">
                  {error}
                </p>
              )}
              {answer && !answer.published && <p className="text-center text-lg">סידור ההושבה עוד לא פורסם. נסו שוב קרוב לאירוע.</p>}
              {answer?.published && answer.matches.length === 0 && (
                <p className="text-center text-lg">לא מצאנו את השם הזה ברשימה. כדאי לבדוק את האיות, או לפנות לבעלי השמחה בכניסה.</p>
              )}
              {answer?.published && answer.matches.length > 0 && (
                <ul className="space-y-2">
                  {answer.matches.map((m, i) => (
                    <li key={i} className={cx("flex items-center gap-3 rounded-2xl px-4 py-3", dark ? "bg-white/15" : "bg-primary/10")}>
                      <Armchair className="size-6 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1 font-semibold">{m.name}</span>
                      <span className="text-xl font-bold">שולחן {m.table}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
