import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { DEVELOPER_URL } from "../components/SiteFooter";
import { Link } from "react-router-dom";
import { applyTheme } from "../lib/themes";

/** Privacy policy + terms (needed for the Google OAuth consent screen / verification). */
type Site = { operatorName: string | null; operatorEmail: string | null };

/** Who runs this copy of the site. Each installer is the operator; the code's developer is not. */
function Operator({ site }: { site: Site | null }) {
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-5" aria-labelledby="operator">
      <h2 id="operator" className="text-xl font-bold">
        מי מפעיל את האתר
      </h2>
      {site?.operatorName ? (
        <p>
          האתר מופעל על ידי <strong>{site.operatorName}</strong>
          {site.operatorEmail && (
            <>
              . ליצירת קשר:{" "}
              <a className="underline" href={`mailto:${site.operatorEmail}`}>
                <bdi dir="ltr">{site.operatorEmail}</bdi>
              </a>
            </>
          )}
          .
        </p>
      ) : (
        <p>האתר מופעל על ידי מי שהתקין אותו (מפעיל האתר).</p>
      )}
      <p>
        האתר מבוסס על קוד פתוח, שכל אחד יכול להתקין בחשבון שלו. מפתח הקוד (
        <a className="underline" href={DEVELOPER_URL} target="_blank" rel="noopener">
          <bdi dir="ltr">ShpatzAppZ</bdi>
        </a>
        ) אינו מפעיל את האתר הזה, אין לו גישה לנתונים, לתמונות או לחשבונות שלו, והוא אינו אחראי לתוכן שבו או לשימוש בו.
      </p>
    </section>
  );
}

export default function Legal({ kind }: { kind: "privacy" | "terms" }) {
  const [site, setSite] = useState<Site | null>(null);
  useEffect(() => {
    api<Site>("/site").then(setSite, () => setSite(null));
  }, []);
  useEffect(() => {
    applyTheme("general");
    document.title = kind === "privacy" ? "מדיניות פרטיות · אירוע פרוע" : "תנאי שימוש · אירוע פרוע";
  }, [kind]);
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-5 py-10 text-base leading-relaxed">
      <Link to="/" className="font-semibold text-primary underline">
        אירוע פרוע
      </Link>
      {kind === "privacy" ? (
        <>
          <h1 className="text-3xl font-bold">מדיניות פרטיות</h1>
          <Operator site={site} />
          <p>האתר מאפשר לבעלי אירועים לאסוף תמונות וסרטונים מהאורחים לתוך חשבון Google Photos של בעל האירוע.</p>
          <h2 className="text-xl font-bold">מה נשמר ואיפה</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>התמונות והסרטונים נשמרים בחשבון Google Photos של בעל האירוע בלבד, ולא בשרתי האתר.</li>
            <li>האתר שומר רק נתונים טכניים: מזהה הקובץ ב-Google, שם האלבום שהאורח בחר (בדרך כלל השם שלו), מזהה מכשיר אקראי, וזמני צילום והעלאה.</li>
            <li>לבעלי אירועים נשמרים כתובת האימייל, השם ואסימון גישה מוצפן ל-Google.</li>
            <li>מיקום GPS מוסר מתמונות דחוסות, אלא אם בעל האירוע בחר לשמור אותו.</li>
          </ul>
          <h2 className="text-xl font-bold">שימוש בנתוני Google</h2>
          <p>
            האתר משתמש בהרשאות Google Photos כדי להעלות תמונות לחשבון בעל האירוע, לנהל את האלבומים שהאתר עצמו יצר ולייבא תמונות שבעל האירוע בחר במפורש. בנוסף הוא
            קורא את נתוני נפח האחסון (Drive) כדי להציג אותו ולהתריע מעל 80%. האתר לא ניגש לתמונות אחרות בחשבון ולא משתף נתונים עם צד שלישי. השימוש במידע שמתקבל מ-Google
            API עומד ב-
            <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>
            , כולל דרישות ה-Limited Use.
          </p>
          <h2 className="text-xl font-bold">מחיקה</h2>
          <p>
            בעל האירוע יכול למחוק אירוע ואלבומים מהאתר בכל עת, ולבטל את גישת האתר בכתובת{" "}
            <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              myaccount.google.com/permissions
            </a>
            . הקבצים עצמם נשארים בחשבון Google Photos שלו, ושם אפשר למחוק אותם לצמיתות.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold">תנאי שימוש</h1>
          <Operator site={site} />
          <ul className="list-inside list-disc space-y-2">
            <li>השירות ניתן כמות שהוא (AS IS), ללא התחייבות לזמינות או לשמירת נתונים מעבר למה ש-Google Photos מספקת.</li>
            <li>האחריות להפעלת האתר, לתוכן שבו ולעמידה בדין חלה על מפעיל האתר בלבד. מפתח הקוד הפתוח אינו צד לשימוש באתר.</li>
            <li>מי שמעלה תמונה מאשר שיש לו זכות לשתף אותה עם בעל האירוע ועם שאר האורחים.</li>
            <li>בעל האירוע אחראי לתוכן שבאירוע שלו, ויכול להסיר כל תמונה.</li>
            <li>אין להעלות תוכן פוגעני או בלתי חוקי.</li>
            <li>השימוש ב-Google Photos כפוף גם לתנאי השימוש של Google.</li>
          </ul>
        </>
      )}
    </main>
  );
}
