# אירוע פרוע - אלבום תמונות משותף לאירועים

אתר לאירועים (חתונה, יום הולדת, בר מצווה ועוד): האורחים סורקים QR, מעלים תמונות וסרטונים בלי הרשמה, וכולם צופים באלבום בזמן אמת. הקבצים נשמרים ב-Google Photos של בעל האירוע.

הקוד פתוח וחינמי. כל אחד מתקין עותק משלו, בחשבונות שלו, בחינם:
- **האתר** רץ בחשבון Cloudflare שלכם (תוכנית חינמית).
- **התמונות** נשמרות בחשבון Google שלכם.

## מי הבעלים של האתר?

**אתם.** מי שמתקין את הקוד הוא הבעלים והמפעיל של העותק שלו: החשבונות, הנתונים, הכתובת והאחריות לשימוש באתר שלו. מפתח הקוד ([ShpatzAppZ](https://ohad-shpindel.shpatzappz.link)) לא מפעיל את האתרים שמותקנים מהקוד הזה, ואין לו גישה לנתונים, לתמונות או לחשבונות שלהם. הקוד ניתן כמות שהוא (AS IS), ללא אחריות. ראו [LICENSE](LICENSE).

במהלך ההתקנה ממלאים את שם המפעיל ואימייל ליצירת קשר. הם מופיעים בעמודי מדיניות הפרטיות ותנאי השימוש באתר שלכם.

---

## שתי דרכים להתקין

| | **דרך א: דרך GitHub ו-Cloudflare** (מומלץ) | **דרך ב: מהמחשב** |
|---|---|---|
| מה צריך | חשבונות GitHub, Cloudflare ו-Google (חינמיים) | מחשב עם Node.js, וחשבונות Cloudflare ו-Google |
| גרסאות חדשות | **מותקנות לבד**, בלילה שאחרי שהן יוצאות (אבל לא באמצע אירוע) | לוח הניהול מודיע שיש גרסה חדשה, ומעדכנים מהמחשב |
| חלון שחור (טרמינל) | לא צריך | צריך, ההוראות בו באנגלית |
| זמן | כ-25 דקות, פעם אחת | כ-20 דקות, פעם אחת |

אפשר להתחיל בדרך ב ולעבור לדרך א בהמשך, בלי לאבד כלום ([מעבר לעדכונים אוטומטיים](#מעבר-מהתקנה-מהמחשב-לעדכונים-אוטומטיים)).

---

## דרך א: התקנה דרך GitHub ו-Cloudflare (מתעדכן לבד)

### מה צריך
- חשבון [GitHub](https://github.com/signup) (חינמי).
- חשבון [Cloudflare](https://dash.cloudflare.com/sign-up) (חינמי).
- חשבון Google. Google מבקשת כרטיס אשראי לאימות בלבד: השירותים שהאתר משתמש בהם חינמיים, ומגדירים התראת תקציב של 1$ ליתר ביטחון.

### שלב 1: עותק משלכם של הקוד (Fork)
1. מתחברים ל-GitHub.
2. בעמוד של הקוד, [github.com/2shpatz/wild-events](https://github.com/2shpatz/wild-events), לוחצים **Fork** ואז **Create fork**.

> למה צריך עותק? Cloudflare בונה אתרים רק מקוד שנמצא בחשבון GitHub **שלכם**. העותק משמש רק כ"מנוע הפעלה": בכל בנייה האתר לוקח לבד את הגרסה החדשה ביותר מהקוד המקורי. **לא צריך לעדכן את העותק, אף פעם.**

### שלב 2: חיבור העותק ל-Cloudflare
1. נכנסים ל-[Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) ב-Cloudflare.
2. לוחצים **Create application**, בוחרים **GitHub**, ומאשרים ל-Cloudflare גישה לחשבון GitHub שלכם (מספיק לעותק `wild-events`).
3. בוחרים מהרשימה את **העותק שלכם**, `<השם-שלכם>/wild-events` (לא את המקור `2shpatz/wild-events`, אם הוא מופיע), וממלאים:
   - **שם הפרויקט:** `albums` (מומלץ). זה החלק הראשון של כתובת האתר: `https://albums.<השם-שלכם>.workers.dev`.
   - **Build command:** משאירים ריק. אם Cloudflare מילאה שם `npm run build`, מוחקים.
   - **Deploy command:** `npm run deploy` (במקום `npx wrangler deploy` ש-Cloudflare ממלאת לבד).
4. לוחצים **Save and Deploy**. הבנייה הראשונה לוקחת כ-3 דקות.

> בחרתם שם אחר? זה עובד. Cloudflare עשויה לפתוח בעותק שלכם בקשת שינוי (Pull Request) על שם ה-Worker. אפשר לסגור אותה.

### שלב 3: קוד ההגדרה
בסיום הבנייה הראשונה נוצר קוד הגדרה סודי, שמאפשר לשנות את הגדרות האתר:
1. ב-Cloudflare, בדף האתר: **Deployments** ואז **View build history**, ולוחצים על הבנייה העליונה ברשימה.
2. גוללים לסוף היומן. יש שם מסגרת כזו:
   ```
   | YOUR SITE IS READY - NEXT STEP: THE SETUP WIZARD     |
   | Setup link (open it on a computer):                  |
   |   https://albums.<השם-שלכם>.workers.dev/setup?token=XXXXXXXXXXXXXXXXXXXXXXXX
   | Setup code (if the wizard asks for it):              |
   |   XXXXXXXXXXXXXXXXXXXXXXXX                           |
   ```
   **קוד ההגדרה** הוא 24 התווים שמתחת ל-`Setup code` (אותם תווים שאחרי `token=` בקישור). מעתיקים את הקישור והקוד ושומרים אותם במקום בטוח: הם מוצגים רק פעם אחת.

### שלב 4: אשף ההגדרה (בדפדפן, בעברית, כ-15 דקות)
פותחים את קישור ההגדרה במחשב. האשף מלווה אתכם בכל לחיצה:
1. ממלאים את פרטי מפעיל האתר.
2. פותחים חשבון חיוב ב-Google Cloud (בלי תשלום) ופרויקט חדש.
3. מפעילים 5 שירותים.
4. ממלאים את מסך ההסכמה ואת ההרשאות, ומפרסמים את האפליקציה.
5. יוצרים מפתח חיבור, מדביקים אותו באשף ובודקים שהחיבור עובד. חשבון ה-Google שאיתו בודקים הופך ל**מנהל/ת האתר**.
6. **עדכונים אוטומטיים** (בשלב האחרון): מחברים פעם אחת "Deploy Hook", כדי שהאתר יוכל לבנות את עצמו מחדש כשיוצאת גרסה חדשה:
   - ב-Cloudflare, בדף האתר: **Settings** ואז **Builds** ואז **Deploy Hooks**.
   - נותנים שם (למשל `auto-update`), בוחרים את הענף `main` ולוחצים **Create**.
   - מעתיקים את הכתובת שנוצרה ומדביקים אותה באשף. אפשר לעשות את זה גם אחר כך, בלוח ניהול האתר, בלשונית **עדכונים**.

כל כפתור כחול פותח את הדף הנכון ב-Google בלשונית חדשה. אפשר לעצור באמצע ולחזור, כי ההתקדמות נשמרת.

### שלב 5: אירוע ראשון
נכנסים לאתר, לוחצים "התחברות עם Google" ויוצרים אירוע. האתר נותן קישור ו-QR לשתף עם האורחים.

בשלב "אחסון התמונות" בוחרים באיזה חשבון Google יישמרו התמונות של האירוע. מומלץ ליצור חשבון Google חדש רק לאירוע (15GB בחינם), כדי שהאורחים לא ימלאו את החשבון הפרטי. אפשר להעביר אירוע לחשבון אחר גם אחר כך, ממסך הניהול.

### מסך ניהול האירוע
למעלה שלוש לשוניות ראשיות, ובצד ימין סרגל סמלים לעמודים של כל אחת (מעבירים את העכבר או מחזיקים כדי לראות את השם):
- **עמוד האורחים**: שיתוף ו-QR, עיצוב, מוזיקה.
- **תמונות ואלבומים**: התמונות שהועלו, האלבומים וייבוא מ-Google Photos.
- **ניהול האירוע**: לוח בקרה, רשימת המוזמנים, אישורי הגעה, סידור הושבה, מתנות, נותני שירות, הוצאות ותקציב, והגדרות.

**רשימת האורחים** מנוהלת לפי משפחות (הזמנה אחת = שורה אחת). לכל משפחה יש קישור אישי לאישור הגעה, ששולחים בוואטסאפ בלחיצה. אפשר לייבא רשימה קיימת בהדבקה מ-Excel או מ-Google Sheets. בעמוד ההגדרות אפשר לחבר **גיליון Google Sheets** שמסתנכרן לשני הכיוונים: האתר יוצר אותו בחשבון ה-Google של האירוע. עמודה שמוסיפים בגיליון נוספת גם לאתר. לא משנים את העמודה המוסתרת "מזהה". הסנכרון רץ כשהעמוד פתוח וגם כל רבע שעה ברקע.

---

## דרך ב: התקנה מהמחשב

### מה צריך
- מחשב Windows או Mac (או Linux).
- כתובת אימייל, בשביל חשבון Cloudflare חינמי. אפשר לפתוח אותו במהלך ההתקנה.
- חשבון Google (כמו בדרך א).

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

### שלב 4: אשף ההגדרה ואירוע ראשון
כמו בדרך א, [שלבים 4 ו-5](#שלב-4-אשף-ההגדרה-בדפדפן-בעברית-כ-15-דקות) (בלי החלק של העדכונים האוטומטיים).

> **קישור ההגדרה** (`.../setup?token=...`) מאפשר לשנות את הגדרות האתר. שמרו אותו לעצמכם ואל תשתפו אותו.

---

## ניהול האתר: מי יכול להשתמש בו
מנהל/ת האתר (מי שמארח/ת אותו) רואה בלוח הבקרה כפתור **"ניהול האתר"** (`/admin`). שם:
- **משתמשים**: מוסיפים משתמשים לפי מייל (ושם, לא חובה), ורואים לכל אחד כמה אירועים, אלבומים ותמונות יש לו.
- **ממתינים**: מי שמתחבר בפעם הראשונה נכנס לרשימת המתנה ומקבל הודעה על כך. המנהל/ת מקבל/ת מייל, ומאשר/ת או דוחה. אחרי האישור נשלח למשתמש מייל הזמנה עם קישור.
- **ארכיון**: "מחיקה" של משתמש מעבירה אותו לארכיון. הוא לא יכול להתחבר, ודפי האירועים שלו לא זמינים לאורחים. מהארכיון אפשר להחזיר, או למחוק לצמיתות (התמונות נשארות ב-Google Photos שלו).
- **עדכונים**: הגרסה של האתר, מה חדש, ועדכונים אוטומטיים (ראו [גרסאות ועדכונים](#גרסאות-ועדכונים)).
- **הגדרות**: הפעלה או כיבוי של רשימת ההמתנה (כשהיא כבויה, כל מי שמתחבר יכול להשתמש מיד), חיבור שליחת מיילים, ופרטי מפעיל האתר.

**מי המנהל/ת?** מי שמחזיק/ה את קוד ההגדרה. זה לא תלוי בשרת או בפלטפורמה: הקוד הוא סוד (`SETUP_TOKEN`) שנשמר בהגדרות האתר, והמנהל/ת נשמר/ת במסד הנתונים לפי חשבון ה-Google. כדי להפוך למנהל/ת (או להעביר את הניהול לחשבון אחר): פותחים את קישור ההגדרה, ובשלב האחרון לוחצים **"כניסה כמנהל/ת האתר"**. משתמשים שהיו באתר לפני שהתכונה נוספה נשארים מורשים.

**שליחת מיילים** יוצאת מה-Gmail של המנהל/ת, בלי שירות נוסף:
1. מפעילים את [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) בפרויקט של האתר.
2. ב-[Data Access](https://console.cloud.google.com/auth/scopes) מוסיפים את ההרשאה `https://www.googleapis.com/auth/gmail.send`.
3. בניהול האתר, בלשונית **הגדרות**, לוחצים **"חיבור שליחת מיילים"** ומאשרים. רק המנהל/ת מתבקש/ת לאשר את ההרשאה הזו.

---

## גרסאות ועדכונים
לכל גרסה של הקוד יש מספר (למשל `1.2.0`) ורשימת חידושים. **רק מנהל/ת האתר** רואה אותם: בלוח הבקרה מופיעה הודעה כשיש גרסה חדשה או אחרי שהאתר התעדכן, ובלשונית **עדכונים** בניהול האתר רואים את הגרסה הנוכחית, מה חדש, ו"צריך לעשות" אם גרסה דורשת פעולה ידנית. כל ההיסטוריה גם ב-[CHANGELOG.md](CHANGELOG.md).

### אתר שהותקן דרך GitHub (דרך א)
- פעם בלילה (בסביבות 3-4 לפנות בוקר, שעון ישראל) האתר בודק אם יצאה גרסה חדשה. אם כן, הוא מבקש מ-Cloudflare לבנות אותו מחדש (דרך ה-Deploy Hook), והבנייה לוקחת את הקוד החדש ביותר. אחרי כמה דקות האתר בגרסה החדשה, ובבוקר מנהל/ת האתר רואה מה חדש.
- **לא באמצע אירוע:** אם אורחים העלו תמונות בשעה שלפני הבדיקה, העדכון מחכה ללילה הבא.
- בלשונית **עדכונים** אפשר לכבות עדכונים אוטומטיים, ללחוץ **בדיקה עכשיו** כדי לבדוק בלי לחכות ללילה, או ללחוץ **עדכון עכשיו**. אחרי **עדכון עכשיו** האתר מבקש שוב כל 15 דקות עד שהגרסה מותקנת (עד יממה, ואחר כך ממשיך בלילה).
- אם בנייה נכשלת, האתר נשאר בגרסה הקודמת ומנסה שוב בלילה הבא.
- מבנה מסד הנתונים מתעדכן לבד בגרסה החדשה. הנתונים נשמרים.

**משתני בנייה (לא חובה).** ב-Cloudflare, בדף האתר: **Settings** ואז **Build**, תחת **Build variables and secrets**:

| משתנה | מה הוא עושה |
|---|---|
| `UPSTREAM_REF=v1.2.0` | נועל את האתר על גרסה מסוימת (בלי עדכונים אוטומטיים). מוחקים את המשתנה כדי לחזור להתעדכן. |
| `FOLLOW_UPSTREAM=off` | בונה את העותק שלכם כמו שהוא. למי שמשנה את הקוד בעצמו. |
| `UPSTREAM_REPO=<כתובת git>` | לוקח את הגרסאות ממאגר קוד אחר. |

### אתר שהותקן מהמחשב (דרך ב)
1. מורידים את הקוד החדש (Download ZIP) ומחלצים לתיקייה חדשה.
2. מעתיקים אליה את הקובץ המוסתר `.deploy-state.json` מהתיקייה הישנה.
   - ב-Mac: מקש `Cmd+Shift+.` מציג קבצים מוסתרים.
   - ב-Windows: בסייר הקבצים בוחרים "תצוגה" ואז "פריטים מוסתרים".
3. פותחים טרמינל בתיקייה החדשה ומריצים `npm install`, ואחריו `npm run deploy`.

אם הקובץ אבד: מריצים `npm run setup` ובוחרים **בדיוק את אותו שם אתר** שבחרתם בהתחלה. מסד הנתונים והחיבור ל-Google נשמרים.

### מעבר מהתקנה מהמחשב לעדכונים אוטומטיים
האתר, הכתובת, מסד הנתונים, החיבור ל-Google והדומיין נשמרים:
1. יוצרים עותק של הקוד ב-GitHub ([שלב 1 בדרך א](#שלב-1-עותק-משלכם-של-הקוד-fork)).
2. ב-Cloudflare, בדף האתר הקיים: **Settings** ואז **Builds** ואז **Connect**. בוחרים את העותק, ענף `main`, **Build command** ריק, ו-**Deploy command** `npm run deploy` (מוחקים את מה ש-Cloudflare ממלאת לבד בשני השדות).
3. מפעילים בנייה ראשונה: ב-**Deployments**, או בדחיפת שינוי קטן לעותק. היא משתמשת באותו מסד נתונים ובאותם סודות.
4. בניהול האתר, בלשונית **עדכונים**, מחברים Deploy Hook ([שלב 4 בדרך א](#שלב-4-אשף-ההגדרה-בדפדפן-בעברית-כ-15-דקות), סעיף 6).

> מעכשיו **לא מריצים יותר `npm run deploy` מהתיקייה הישנה.** הוא היה מחזיר לאתר את הגרסה שבתיקייה.

---

## דומיין משלכם (אופציונלי)
צריך דומיין שמחובר לאותו חשבון Cloudflare.

**דרך א (GitHub):**
1. ב-Cloudflare, בדף האתר: **Settings** ואז **Domains & Routes** ואז **Add** ואז **Custom Domain**, מקלידים את הכתובת המלאה (למשל `photos.example.com`) ולוחצים **Add Custom Domain**.
2. באותו דף: **Settings** ואז **Variables and Secrets** ואז **Add**. סוג: טקסט, שם: `CANONICAL_ORIGIN`, ערך: `https://photos.example.com`, ואז **Deploy**. כך הכתובת workers.dev מעבירה לדומיין, וקישורים ישנים לא נשברים.

**דרך ב (מחשב):** מריצים `npm run setup` ומקלידים את הכתובת המלאה. Cloudflare יוצרת את הכתובת ואת תעודת האבטחה אוטומטית, והכתובת workers.dev מעבירה לכתובת החדשה.

**בשתי הדרכים**, ב-Google Cloud Console מוסיפים לכתובת החדשה:
- **Clients**: ב-Authorized JavaScript origins את `https://<הדומיין>`, וב-Authorized redirect URIs את `https://<הדומיין>/api/auth/callback`.
- **Branding**: ב-Authorized domains את הדומיין הראשי, ומעדכנים את 3 הקישורים.

ואז פותחים את אשף ההגדרה בכתובת החדשה ומריצים את שלב "בדיקה".

## איבדתי את קישור ההגדרה
קוד ההגדרה הוא ההוכחה שאתם מארחים את האתר, ולכן אי אפשר לשחזר אותו מתוך האתר (גם לא מלוח הניהול). יוצרים קוד חדש במקום שרק המארח/ת יכול/ה להגיע אליו:
- **דרך א:** ב-Cloudflare, בדף האתר: **Settings** ואז **Variables and Secrets**. עורכים את הסוד `SETUP_TOKEN` (או מוסיפים אותו, סוג **Secret**) ונותנים לו ערך חדש, ארוך וקשה לניחוש, ואז **Deploy**. נכנסים ל-`https://<האתר>/setup` ומקלידים את הערך כקוד ההגדרה.
- **דרך ב:** מריצים בתיקייה `npm run deploy` (הקישור מודפס שוב), ואם הקובץ `.deploy-state.json` אבד: `npm run setup` עם אותו שם אתר.

## אפשר להקים אתר מקוד של מישהו אחר?
**כן.** הקוד פתוח (רישיון MIT) וכל אחד יכול להקים ממנו אתר משלו, בלי לבקש רשות. כמה דברים שכדאי לדעת:
- **רק המפתח יכול לשנות את הקוד המקורי.** GitHub מאפשר לכל אחד להעתיק ולקרוא, אבל רק לבעלים לשנות. כל אתר שמתעדכן אוטומטית מקבל רק את מה שהמפתח שחרר.
- **אי אפשר לחבר את Cloudflare ישירות לקוד של מישהו אחר.** Cloudflare (וגם Vercel, Netlify ו-Render) בונה אוטומטית רק מקוד שנמצא בחשבון שלכם. לכן בדרך א יוצרים עותק (Fork).
- **GitHub לא מעדכן עותקים לבד.** כדי שלא תצטרכו לעשות כלום, העותק שלכם רק מפעיל את הבנייה, והבנייה עצמה לוקחת תמיד את הקוד החדש ביותר מהמקור.
- **אמון:** אתר שמתעדכן לבד מריץ כל גרסה שהמפתח משחרר. מעדיפים לבדוק כל גרסה לפני שהיא מותקנת? כבו עדכונים אוטומטיים, או נעלו גרסה עם `UPSTREAM_REF`.

## בעיות נפוצות
| מה קרה | מה עושים |
|---|---|
| `You need to register a workers.dev subdomain` | מריצים שוב את ההתקנה, ועונים `y` כשנשאלים. |
| ב-Mac: "cannot be opened because it is from an unidentified developer" | כפתור ימני על הקובץ, **Open**, ושוב **Open**. |
| `node` is not recognized | Node.js לא הותקן, או שצריך לסגור ולפתוח מחדש את החלון אחרי ההתקנה. |
| `Node.js 22.12 or newer is needed` | מתקינים את גרסת ה-LTS העדכנית מ-[nodejs.org](https://nodejs.org). |
| הדפדפן לא נפתח | מעתיקים את הקישור שמודפס בחלון השחור. |
| בהתחברות ל-Google מופיע "Google hasn't verified this app" | זה צפוי באפליקציה פרטית: לוחצים **Advanced**, ואז **Go to ...**. |
| בנייה ב-Cloudflare נכשלה עם `Could not get the newest code` | GitHub לא היה זמין לרגע. האתר נשאר בגרסה הקודמת. ב-**Deployments** לוחצים על בנייה חוזרת (Retry), או מחכים לבדיקה הבאה. |
| בנייה נכשלה עם `Wrong build settings`, או שאחרי בנייה האתר חזר לגרסה ישנה | הגדרות הבנייה חזרו לברירת המחדל של Cloudflare (קורה למשל אחרי ניתוק וחיבור מחדש של העותק). ב-**Settings** ואז **Build**, ליד **Build configuration** לוחצים על העיפרון: **Build command** ריק, **Deploy command** `npm run deploy`. ואז ב-**Deployments** לוחצים **Retry build**. |
| בנייה נכשלה עם `needs Node.js` | ב-**Settings** ואז **Build**, תחת **Build variables and secrets**, מוסיפים `NODE_VERSION` עם הערך `22`, ובונים שוב. |
| האתר לא מתעדכן לגרסה חדשה | בניהול האתר ← **עדכונים** כתוב למה (למשל: הגרסה תותקן הלילה, או שה-Deploy Hook לא תקין). את פרטי הבנייה רואים ב-Cloudflare: **Deployments** ואז **View build history**. |

## מגבלות של Google
- האתר רואה רק קבצים שהוא עצמו העלה. תמונות שכבר נמצאות ב-Google Photos נכנסות דרך "ייבוא מ-Google Photos" (כעותק).
- אי אפשר למחוק קבצים לצמיתות דרך ה-API. "מחיקה" מסירה מהאלבומים ומסתירה, ומחיקה סופית עושים ב-Google Photos.
- עד ש-Google מאמתת את האפליקציה: מסך אזהרה בהתחברות, ומגבלה של 100 חשבונות Google לכל החיים. כל בעל אירוע נספר, וגם כל חשבון אחסון ייעודי שמחברים לאירוע. אורחים לא נספרים.
- העברת אירוע לחשבון אחר מעתיקה את התמונות, אבל לא מוחקת אותן מהחשבון הקודם (ה-API לא מאפשר). כדי לפנות שם מקום מוחקים ידנית ב-Google Photos.
- רשימת האורחים מסתנכרנת רק עם גיליון שהאתר יצר (הרשאת `drive.file`, בלי מסך אישור נוסף). רשימה קיימת מייבאים בהדבקה. ל-Google Sheets צריך להפעיל את Google Sheets API בפרויקט של האתר.

---

## למפתחים

### פיתוח מקומי
```bash
npm install
npm run setup:local   # יוצר .dev.vars ומסד נתונים מקומי, ומדפיס קישור לאשף ההגדרה
npm run dev           # http://localhost:5173
npm test              # בדיקות הלוגיקה של רשימת האורחים וסנכרון Google Sheets (מול Google מדומה)
```

### ענפים, גרסאות ושחרור
- **`main` = גרסאות ששוחררו בלבד.** כל האתרים בדרך א בונים ממנו, ולכן לא עובדים עליו ישירות. העבודה השוטפת נעשית בענף **`dev`**.
- כל שינוי שמשתמשים ירגישו בו מקבל שורה בעברית פשוטה ברשומה `"unreleased"` שבראש `release-notes.json`. זה הטקסט שמנהלי האתרים יראו תחת "מה חדש". פעולה ידנית שמנהלים חייבים לעשות נכתבת ב-`adminAction`.
- **שחרור:** `npm run release -- patch` (תיקונים), `minor` (חידושים) או `major` (דורש פעולה של המנהלים). הסקריפט בודק, מעדכן את מספר הגרסה, יוצר את `CHANGELOG.md`, מריץ typecheck, build ואת כל ה-migrations על מסד נתונים חדש, ממזג את `dev` ל-`main` ומוסיף תגית `vX.Y.Z`. הוא **לא** דוחף. הפרסום: `git push origin dev main vX.Y.Z`.
- **Migrations:** רק תוספות (גרסה ישנה ממשיכה לרוץ לרגע ליד המבנה החדש), בלי `BEGIN`/`COMMIT` ובלי triggers. בנייה מחדש של טבלה צריכה `PRAGMA defer_foreign_keys = true`. האתר מריץ אותן בעצמו (`worker/lib/schema.ts`), באותה טבלת מעקב של wrangler (`d1_migrations`).
- **לא לשנות את ההתנהגות של `scripts/deploy.mjs` ו-`scripts/ci-bootstrap.mjs`.** העותקים של כל המפעילים מריצים את הגרסה שלהם של שני הקבצים האלה לתמיד. כל השאר (`scripts/ci/deploy.mjs` והלאה) מגיע תמיד מהקוד החדש.

### אתר ניסיון: כל גרסה עוברת בו לפני האתר החי
יש אתר ניסיון קבוע שמותקן בדרך א, בדיוק כמו אצל מפעילים אחרים:

| | |
|---|---|
| כתובת | `https://albums-test.shpatzappz.link` (הכתובת `albums-test.<חשבון>.workers.dev` מעבירה אליה) |
| ב-Cloudflare | Worker בשם `albums-test`, מסד נתונים `albums-test-db`, משתנה `CANONICAL_ORIGIN`, Deploy Hook בשם `auto-update` |
| ב-GitHub | העותק `ShpatzAppZ/wild-events`, בארגון נפרד (אי אפשר לעשות Fork למאגר שלך לאותו חשבון) |
| ב-Google | מפתח חיבור משלו, באותו פרויקט Google Cloud של האתר החי |

**אחרי כל שחרור:**
1. דוחפים: `git push origin dev main vX.Y.Z`.
2. אתר הניסיון מתעדכן לבד בלילה (בסביבות 01:00 UTC). לא רוצים לחכות? מחכים 5-10 דקות אחרי הדחיפה (GitHub ו-Cloudflare שומרים לזמן קצר עותק של רשימת הגרסאות), ואז באתר הניסיון: ניהול האתר, לשונית **עדכונים**, **בדיקה עכשיו** ואז **עדכון עכשיו**. הבנייה לוקחת כ-2 דקות.
3. בודקים באתר הניסיון: בלשונית **עדכונים** מופיעה הגרסה החדשה, מה שהשתנה בגרסה עובד, וההתחברות עם Google עובדת.
4. רק אחרי זה מעדכנים את האתר החי מהמחשב: `npm run deploy`, מהתיקייה כש-`dev` זהה ל-`main` (מיד אחרי שחרור).

**כללים לאתר הניסיון:**
- **לא מעדכנים את העותק `ShpatzAppZ/wild-events`** (בלי Sync fork ובלי דחיפות). הוא צריך להישאר קפוא כמו העותקים של מפעילים אחרים, כדי שהבדיקה תהיה אמיתית: אם אתר הניסיון מתעדכן, גם עותקים ישנים אצל אחרים מתעדכנים.
- **ב-Cloudflare מחובר העותק, לא המאגר המקורי.** אחרת כל דחיפה בונה את האתר מיד, ובקשת העדכון של האתר עצמו לא נבדקת.
- **הגדרות הבנייה:** Build command ריק, Deploy command `npm run deploy`. ניתוק וחיבור מחדש של העותק מחזירים את ברירות המחדל של Cloudflare. אז בנייה מעלה בשקט את הקוד הקפוא של העותק (גרסה 1.0.0), כי העותק נוצר לפני ההגנה שעוצרת בנייה כזו.
- **מה קרה בבנייה:** ב-Cloudflare, בדף `albums-test`: **Deployments** ואז **View build history**.
- **קוד ההגדרה** הודפס רק ביומן הבנייה הראשונה. אם צריך אותו ואין אותו: ב-**Settings** ואז **Variables and Secrets**, מגדירים סוד חדש `SETUP_TOKEN` (לפחות 24 תווים אקראיים), ופותחים `https://albums-test.shpatzappz.link/setup?token=<הקוד>`.
- לא מעלים לאתר הניסיון תמונות אמיתיות של אירועים.

### מבנה הקוד
- `worker/`: ה-API (Hono על Cloudflare Workers). כולל התחברות Google, העלאות (רגילות ובחלקים לסרטונים), feed חי, ניהול, וייבוא מ-Google Photos (Picker). ניהול האתר: `worker/routes/admin.ts`, עדכונים: `worker/lib/updates.ts` ו-`worker/routes/updates.ts`, גרסה: `worker/lib/appInfo.ts`, מבנה מסד הנתונים: `worker/lib/schema.ts`, מיילים: `worker/lib/mail.ts` ו-`worker/lib/emails.ts`.
- `src/`: האתר (React + Tailwind, RTL). כולל דף אירוע, העלאה, גלריה, ניהול ואשפים.
- רשימת האורחים ("ניהול האירוע"): הלוגיקה המשותפת `shared/guests.ts`, ה-API `worker/routes/planner.ts`, הסנכרון עם Google Sheets `worker/lib/sheets.ts`, המסכים `src/components/planner/` (מפת ההושבה ב-`seating/`), ועמוד אישור ההגעה `src/routes/Rsvp.tsx`.
- `migrations/`: סכמת מסד הנתונים (D1).
- `release-notes.json`: מה חדש בכל גרסה. `CHANGELOG.md` נוצר ממנו.
- `scripts/setup.mjs`: ההתקנה המודרכת מהמחשב. `scripts/deploy.mjs`: `npm run deploy` (מהמחשב: `scripts/deploy-cli.mjs`, ב-Cloudflare: `scripts/ci-bootstrap.mjs` ואז `scripts/ci/deploy.mjs`). `scripts/lib/deploy-core.mjs`: הלוגיקה המשותפת. `scripts/release.mjs`: שחרור גרסה.
- `design-system/`: מערכת העיצוב.

ההגדרות האישיות של התקנה מהמחשב (שם האתר, מזהה מסד הנתונים, דומיין, קוד ההגדרה) נשמרות רק ב-`.deploy-state.json`, שלא נכנס ל-git, ומועברות לבנייה בלי לשנות קבצים. הקובץ `wrangler.jsonc` נשאר כללי: בלי מזהה מסד נתונים, כי Cloudflare ממשיכה להשתמש במסד שכבר מחובר לאתר.

---

## English (short)
**Eirua Parua** is a free, open-source, self-hosted live photo album for events (Hebrew UI). Guests scan a QR code and upload photos and videos without signing up. Media is stored in the event owner's Google Photos. It runs on the Cloudflare Workers + D1 free plan.

**You own your copy.** Whoever deploys this code is the operator of that site. The developer ([ShpatzAppZ](https://ohad-shpindel.shpatzappz.link)) has no access to it and no responsibility for it. MIT licensed, provided AS IS.

**Install, option A - GitHub + Cloudflare (updates itself, recommended):**
1. Fork this repository. Cloudflare can only build repositories in your own account. Your fork is just a launcher: every build fetches the newest release of the original repository (`scripts/ci-bootstrap.mjs`), so the fork never needs syncing.
2. Cloudflare dashboard: Workers & Pages, then Create application, then GitHub. Pick your fork, name it `albums`, leave Build command empty, and set Deploy command `npm run deploy` (replace Cloudflare's defaults `npm run build` / `npx wrangler deploy`). Then Save and Deploy.
3. The end of the first build log (Deployments, then View build history) shows the setup link and code, once.
4. Run the in-site setup wizard. In its last step, paste a Deploy Hook (Worker, then Settings, then Builds, then Deploy Hooks, branch `main`).

**Install, option B - from a computer:** install Node.js LTS (22.12+), download the ZIP, then run `install-windows.bat`, `install-mac.command`, or `npm run setup`.

**Versions & updates:** only the site admin sees versions and "what's new" (dashboard notice + the Updates tab in `/admin`). Option-A sites check `release-notes.json` of the original repository once a night (around 01:00 UTC) and trigger their own rebuild through the Deploy Hook, never while guests uploaded in the last hour (then they wait for the next night). After "Update now" the site asks again every 15 minutes until the new version runs (for up to a day). The database schema migrates itself at runtime (`worker/lib/schema.ts`, compatible with wrangler's `d1_migrations`). Build variables: `UPSTREAM_REF=vX.Y.Z` pins a version, `FOLLOW_UPSTREAM=off` builds your fork as-is, `UPSTREAM_REPO` changes the source. Option-B sites update with: copy `.deploy-state.json` into the new version's folder, then `npm install && npm run deploy`. To move from B to A, connect the existing Worker to your fork (Settings, then Builds, then Connect); the database, secrets and domain stay.

**Site admin:** whoever holds the setup code (`SETUP_TOKEN`, a plain secret, so it works on any host) claims the site admin role by logging in with Google from the last step of the setup wizard. The admin's `/admin` dashboard manages the allowlist, the waitlist (on by default; new users wait for approval), an archive (blocked accounts, event pages offline), permanent deletion, and updates. Emails (invitations, new-request alerts) are sent from the admin's own Gmail via the Gmail API (`gmail.send`, granted only by the admin).

**Developers:** `main` holds releases only; work on `dev`, add notes to the `unreleased` entry of `release-notes.json`, run `npm run release -- patch|minor|major`, then push `dev`, `main` and the tag. Migrations must be additive, with no transactions or triggers. Never change the behaviour of `scripts/deploy.mjs` and `scripts/ci-bootstrap.mjs`, since forks run their own copies forever.
