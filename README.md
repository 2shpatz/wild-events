# אירוע פרוע - אלבום תמונות משותף לאירועים

אתר לאירועים (חתונה, יום הולדת, בר מצווה ועוד): האורחים סורקים QR, מעלים תמונות וסרטונים בלי הרשמה, וכולם צופים באלבום בזמן אמת. הקבצים נשמרים ב-Google Photos של בעל האירוע.

הקוד פתוח וחינמי. כל אחד מתקין עותק משלו, בחשבונות שלו, בחינם:
- **האתר** רץ בחשבון Cloudflare שלכם (תוכנית חינמית).
- **התמונות** נשמרות בחשבון Google שלכם.

## מי הבעלים של האתר?

**אתם.** מי שמתקין את הקוד הוא הבעלים והמפעיל של העותק שלו: החשבונות, הנתונים, הכתובת והאחריות לשימוש באתר שלו. מפתח הקוד ([ShpatzAppZ](https://ohad-shpindel.shpatzappz.link)) לא מפעיל את האתרים שמותקנים מהקוד הזה, ואין לו גישה לנתונים, לתמונות או לחשבונות שלהם. הקוד ניתן כמות שהוא (AS IS), ללא אחריות. ראו [LICENSE](LICENSE).

במהלך ההתקנה ממלאים את שם המפעיל ואימייל ליצירת קשר. הם מופיעים בעמודי מדיניות הפרטיות ותנאי השימוש באתר שלכם.

---

## התקנה, צעד אחר צעד (כ-20 דקות, פעם אחת)

### מה צריך
- מחשב Windows או Mac (או Linux).
- כתובת אימייל, בשביל חשבון Cloudflare חינמי. אפשר לפתוח אותו במהלך ההתקנה.
- חשבון Google. Google מבקשת כרטיס אשראי לאימות בלבד: השירותים שהאתר משתמש בהם חינמיים, ומגדירים התראת תקציב של 1$ ליתר ביטחון.

### שלב 1: להתקין Node.js
נכנסים ל-[nodejs.org](https://nodejs.org/en/download), מורידים את גרסת **LTS** ומתקינים עם כל ברירות המחדל. אם תדלגו על השלב הזה, קובץ ההתקנה יפתח לכם את הדף.

### שלב 2: להוריד את הקוד
בעמוד הזה ב-GitHub לוחצים על הכפתור הירוק **Code**, ואז **Download ZIP**. מחלצים את הקובץ לתיקייה קבועה, למשל `Documents\eirua-parua`.

> חשוב: **שומרים את התיקייה.** היא מכילה קובץ מוסתר (`.deploy-state.json`) עם ההגדרות של האתר שלכם, ותצטרכו אותו לעדכונים.

### שלב 3: להפעיל את ההתקנה
- **Windows:** לוחצים פעמיים על `install-windows.bat`. אם מופיע "Windows protected your PC", לוחצים **More info** ואז **Run anyway**.
- **Mac:** לוחצים על `install-mac.command` **בכפתור ימני**, בוחרים **Open** ושוב **Open**. בפעמים הבאות מספיקה לחיצה כפולה.
- **Linux, או אם אתם רגילים לטרמינל:** פותחים טרמינל בתיקייה ומריצים `npm run setup`.

ייפתח חלון שחור (טרמינל). ההוראות בו **באנגלית**, כי חלונות טרמינל לא מציגים עברית כמו שצריך. הנה מה שקורה בו, בעברית:

1. **Checking your computer:** ההתקנה בודקת את Node.js ומתקינה רכיבים (דקה-שתיים).
2. **Your Cloudflare account:** נפתח דפדפן עם Cloudflare.
   - אין לכם חשבון? לוחצים **Sign up**, פותחים חשבון חינמי, ומפעילים שוב את קובץ ההתקנה.
   - יש לכם? מתחברים ולוחצים **Allow**, וחוזרים לחלון השחור.
3. **Your site's address:**
   - מקלידים שם קצר באנגלית לאתר (למשל `albums`), או לוחצים Enter לברירת המחדל.
   - אחר כך שואלים אם יש לכם דומיין משלכם. אין? לוחצים Enter.
4. **Publishing the site to Cloudflare:** האתר עולה לאוויר (כ-2 דקות).
   - בחשבון חדש, Cloudflare תשאל `Would you like to register a workers.dev subdomain now?`
   - מקלידים `y`, לוחצים Enter, ובוחרים שם באנגלית (למשל השם שלכם).
   - הכתובת של האתר תהיה `https://<שם-האתר>.<השם-שבחרתם>.workers.dev`.
5. **Connecting Google:** נפתח בדפדפן **אשף ההגדרה של האתר, בעברית**.

### שלב 4: אשף ההגדרה (בדפדפן, בעברית, כ-15 דקות)
האשף מלווה אתכם בכל לחיצה:
1. ממלאים את פרטי מפעיל האתר.
2. פותחים חשבון חיוב ב-Google Cloud (בלי תשלום) ופרויקט חדש.
3. מפעילים 3 שירותים.
4. ממלאים את מסך ההסכמה ואת ההרשאות, ומפרסמים את האפליקציה.
5. יוצרים מפתח חיבור, מדביקים אותו באשף ובודקים שהחיבור עובד.

כל כפתור כחול פותח את הדף הנכון ב-Google בלשונית חדשה. אפשר לעצור באמצע ולחזור, כי ההתקדמות נשמרת.

> **קישור ההגדרה** (`.../setup?token=...`) מאפשר לשנות את הגדרות האתר. שמרו אותו לעצמכם ואל תשתפו אותו. שכחתם אותו? מריצים `npm run deploy` בתיקייה, והקישור מודפס שוב.

### שלב 5: אירוע ראשון
נכנסים לאתר, לוחצים "התחברות עם Google" ויוצרים אירוע. האתר נותן קישור ו-QR לשתף עם האורחים.

---

## עדכון לגרסה חדשה
1. מורידים את הקוד החדש (Download ZIP) ומחלצים לתיקייה חדשה.
2. מעתיקים אליה את הקובץ המוסתר `.deploy-state.json` מהתיקייה הישנה.
   - ב-Mac: מקש `Cmd+Shift+.` מציג קבצים מוסתרים.
   - ב-Windows: בסייר הקבצים בוחרים "תצוגה" ואז "פריטים מוסתרים".
3. פותחים טרמינל בתיקייה החדשה ומריצים `npm install`, ואחריו `npm run deploy`.

אם הקובץ אבד: מריצים `npm run setup` ובוחרים **בדיוק את אותו שם אתר** שבחרתם בהתחלה. מסד הנתונים והחיבור ל-Google נשמרים.

## דומיין משלכם (אופציונלי)
אם יש לכם דומיין שמחובר לאותו חשבון Cloudflare:
1. מריצים `npm run setup` ומקלידים את הכתובת המלאה (למשל `photos.example.com`).
2. Cloudflare יוצרת את הכתובת ואת תעודת האבטחה אוטומטית. הכתובת workers.dev ממשיכה לעבוד ומעבירה לכתובת החדשה, כך שקישורים ישנים לא נשברים.
3. ב-Google Cloud Console מוסיפים לכתובת החדשה:
   - **Clients**: ב-Authorized JavaScript origins את `https://<הדומיין>`, וב-Authorized redirect URIs את `https://<הדומיין>/api/auth/callback`.
   - **Branding**: ב-Authorized domains את הדומיין הראשי, ומעדכנים את 3 הקישורים.
4. פותחים את קישור ההגדרה בכתובת החדשה ומריצים את שלב "בדיקה".

## בעיות נפוצות
| מה קרה | מה עושים |
|---|---|
| `You need to register a workers.dev subdomain` | מריצים שוב את ההתקנה, ועונים `y` כשנשאלים. |
| ב-Mac: "cannot be opened because it is from an unidentified developer" | כפתור ימני על הקובץ, **Open**, ושוב **Open**. |
| `node` is not recognized | Node.js לא הותקן, או שצריך לסגור ולפתוח מחדש את החלון אחרי ההתקנה. |
| הדפדפן לא נפתח | מעתיקים את הקישור שמודפס בחלון השחור. |
| בהתחברות ל-Google מופיע "Google hasn't verified this app" | זה צפוי באפליקציה פרטית: לוחצים **Advanced**, ואז **Go to ...**. |

## מגבלות של Google
- האתר רואה רק קבצים שהוא עצמו העלה. תמונות שכבר נמצאות ב-Google Photos נכנסות דרך "ייבוא מ-Google Photos" (כעותק).
- אי אפשר למחוק קבצים לצמיתות דרך ה-API. "מחיקה" מסירה מהאלבומים ומסתירה, ומחיקה סופית עושים ב-Google Photos.
- עד ש-Google מאמתת את האפליקציה: מסך אזהרה בהתחברות, ומגבלה של 100 בעלי אירועים. אורחים לא נספרים.

## פיתוח מקומי
```bash
npm install
npm run setup:local   # יוצר .dev.vars ומסד נתונים מקומי, ומדפיס קישור לאשף ההגדרה
npm run dev           # http://localhost:5173
```

## מבנה הקוד
- `worker/`: ה-API (Hono על Cloudflare Workers). כולל התחברות Google, העלאות (רגילות ובחלקים לסרטונים), feed חי, ניהול, וייבוא מ-Google Photos (Picker).
- `src/`: האתר (React + Tailwind, RTL). כולל דף אירוע, העלאה, גלריה, ניהול ואשפים.
- `migrations/`: סכמת מסד הנתונים (D1).
- `scripts/setup.mjs`: ההתקנה המודרכת. `scripts/deploy.mjs`: עדכונים. `scripts/lib/deploy-core.mjs`: הלוגיקה המשותפת.
- `design-system/`: מערכת העיצוב.

ההגדרות האישיות שלכם (שם האתר, מזהה מסד הנתונים, דומיין, קוד ההגדרה) נשמרות רק ב-`.deploy-state.json`, שלא נכנס ל-git. הקובץ `wrangler.jsonc` נשאר כללי.

---

## English (short)
**Eirua Parua** is a free, open-source, self-hosted live photo album for events (Hebrew UI). Guests scan a QR code and upload photos and videos without signing up. Media is stored in the event owner's Google Photos. It runs on the Cloudflare Workers + D1 free plan.

**You own your copy.** Whoever deploys this code is the operator of that site. The developer ([ShpatzAppZ](https://ohad-shpindel.shpatzappz.link)) has no access to it and no responsibility for it. MIT licensed, provided AS IS.

**Install:**
1. Install Node.js LTS.
2. Download the ZIP.
3. Run `install-windows.bat` / `install-mac.command`, or `npm run setup`.
4. The guided installer logs you in to Cloudflare, deploys, and opens the in-site Google setup wizard.

**Update:** copy `.deploy-state.json` into the new version's folder, then `npm install && npm run deploy`.
