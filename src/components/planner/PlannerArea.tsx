/**
 * The "ניהול האירוע" pages of the manage screen: loads the planner once and shows the requested page.
 * First visit: a short wizard (who the hosts are, circles, Google Sheet).
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { PlannerData } from "../../../shared/guests";
import { Spinner } from "../ui";
import { PlannerProvider, usePlanner } from "./store";
import { Onboarding } from "./Onboarding";
import { Dashboard } from "./Dashboard";
import { GuestList } from "./GuestList";
import { RsvpCenter } from "./RsvpCenter";
import { Gifts } from "./Gifts";
import { Vendors } from "./Vendors";
import { Expenses } from "./Expenses";
import { PlannerSettings } from "./PlannerSettings";
import { SheetStatus } from "./SheetCard";

const Seating = lazy(() => import("./seating/Seating"));

export type PlannerPage = "dashboard" | "guests" | "rsvp" | "seating" | "gifts" | "vendors" | "expenses" | "settings" | string;

export default function PlannerArea({ code, page, go }: { code: string; page: PlannerPage; go: (p: never) => void }) {
  const [data, setData] = useState<PlannerData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api<PlannerData>(`/e/${code}/planner`)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [code]);
  if (failed) return <p className="font-semibold text-destructive">לא הצלחנו לטעון את רשימת האורחים. כדאי לרענן את העמוד.</p>;
  if (!data) return <Spinner />;
  return (
    <PlannerProvider code={code} initial={data}>
      <Pages page={page} go={go as (p: string) => void} />
    </PlannerProvider>
  );
}

function Pages({ page, go }: { page: PlannerPage; go: (p: string) => void }) {
  const { data } = usePlanner();
  const [skipped, setSkipped] = useState(false);
  if (!data.config.onboarded && !skipped && page !== "settings") return <Onboarding onDone={() => setSkipped(true)} />;
  return (
    <>
      {data.sheet && page !== "settings" && <SheetStatus compact />}
      {page === "dashboard" && <Dashboard go={go} />}
      {page === "guests" && <GuestList go={go} />}
      {page === "rsvp" && <RsvpCenter go={go} />}
      {page === "seating" && (
        <Suspense fallback={<Spinner />}>
          <Seating />
        </Suspense>
      )}
      {page === "gifts" && <Gifts />}
      {page === "vendors" && <Vendors />}
      {page === "expenses" && <Expenses go={go} />}
      {page === "settings" && <PlannerSettings />}
    </>
  );
}
