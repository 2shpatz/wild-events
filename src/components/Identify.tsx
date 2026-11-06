import { useState } from "react";
import { UserRound } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { deviceId, saveIdentity } from "../lib/device";
import type { GuestIdentity } from "../../shared/types";
import { Button, Card, Field, inputClass } from "./ui";

type Match = { id: string; name: string; count: number };

/**
 * Name once → album of your own. If the same name already exists (e.g. cookies were cleared),
 * ask "is this you?" instead of silently creating a duplicate album.
 */
export function Identify({ code, onDone }: { code: string; onDone: (id: GuestIdentity) => void }) {
  const [name, setName] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (extra: { confirmAlbumId?: string; forceNew?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<GuestIdentity | { match: Match } | { needName: true }>(`/e/${code}/guest`, {
        method: "POST",
        json: { deviceId: deviceId(), name, ...extra },
      });
      if ("match" in r) setMatch(r.match);
      else if ("token" in r) {
        saveIdentity(code, r);
        onDone(r);
      } else setError("צריך לכתוב שם.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (match) {
    return (
      <Card className="space-y-5">
        <h2 className="text-2xl font-bold">זה אתה?</h2>
        <p className="text-lg leading-relaxed">
          כבר יש באירוע אלבום בשם <strong>{match.name}</strong>
          {match.count > 0 && <> עם {match.count.toLocaleString("he-IL")} תמונות</>}. זה האלבום שלך?
        </p>
        {error && <p className="font-medium text-destructive" role="alert">{error}</p>}
        <div className="grid gap-3">
          <Button size="lg" loading={busy} onClick={() => submit({ confirmAlbumId: match.id })}>
            כן, זה אני - להמשיך לאלבום שלי
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setMatch(null);
              setName((n) => `${n} `);
              setError("כדי להבדיל, אפשר להוסיף שם משפחה או כינוי.");
            }}
          >
            לא, אני מישהו אחר
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UserRound className="size-6" aria-hidden />
        </span>
        <div>
          <h2 className="text-2xl font-bold">איך קוראים לך?</h2>
          <p className="text-muted-fg">כך כולם יידעו מי צילם. שואלים רק פעם אחת.</p>
        </div>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) submit();
        }}
      >
        <Field label="השם שלך" htmlFor="guest-name" error={error}>
          <input
            id="guest-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: דנה כהן"
            autoComplete="name"
            maxLength={40}
            autoFocus
            enterKeyHint="go"
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!name.trim()}>
          המשך להעלאה
        </Button>
      </form>
    </Card>
  );
}
