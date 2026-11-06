import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Images, Share2 } from "lucide-react";
import { eventTitle, knownEvents, sharedFileCount } from "../lib/share";
import { applyTheme } from "../lib/themes";
import { Card, Spinner } from "../components/ui";

/** Landing for the installed app + Android share target: choose which event receives the shared photos. */
export default function ShareReceive() {
  const navigate = useNavigate();
  const [count, setCount] = useState<number | null>(null);
  const events = knownEvents();

  useEffect(() => applyTheme("general"), []);
  useEffect(() => {
    sharedFileCount().then((n) => {
      setCount(n);
      if (n > 0 && events.length === 1) navigate(`/${events[0]}/upload?shared=1`, { replace: true });
      if (n === 0 && events.length === 1) navigate(`/${events[0]}`, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (count === null) return <Spinner className="min-h-dvh" />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Share2 className="mx-auto size-12 text-primary" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold">{count > 0 ? `${count} קבצים מוכנים להעלאה` : "האירועים שלי"}</h1>
        <p className="text-muted-fg">{count > 0 ? "לאיזה אירוע להעלות?" : "בחרו אירוע"}</p>
      </div>
      {events.length === 0 ? (
        <Card className="text-center">
          <p>כדי לשתף תמונות, פתחו קודם את הקישור לאירוע שקיבלתם (למשל בוואטסאפ).</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {events.map((code) => (
            <li key={code}>
              <Link
                to={count > 0 ? `/${code}/upload?shared=1` : `/${code}`}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-5 text-lg font-semibold shadow-soft hover:border-primary"
              >
                <Images className="size-6 text-primary" aria-hidden />
                {eventTitle(code)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
