import { CalendarDays, Image, Images, Mail, Radio, Type, type LucideIcon } from "lucide-react";
import type { Block, BlockType } from "../../../../shared/design";

export const BLOCK_META: Record<BlockType, { label: string; hint: string; Icon: LucideIcon }> = {
  text: { label: "טקסט", hint: "כותרת ופסקה - ברכה, סיפור, הוראות הגעה", Icon: Type },
  image: { label: "תמונה", hint: "תמונה בודדת עם כיתוב", Icon: Image },
  details: { label: "פרטי האירוע", hint: "מתי ואיפה, ניווט, שיתוף והוספה ליומן", Icon: CalendarDays },
  featured: { label: "תמונות מייצגות", hint: "עד 6 תמונות שלכם בסגנון אלבום", Icon: Images },
  invitation: { label: "ההזמנה", hint: "תמונת ההזמנה, נפתחת במסך מלא", Icon: Mail },
  live: { label: "אלבום בזמן אמת", hint: "התמונות האחרונות + כפתורי צפייה והעלאה", Icon: Radio },
};

/** A short line describing the block's content, for the structure list. */
export function blockSummary(b: Block): string {
  if (b.type === "text") return b.heading || b.body.split("\n")[0] || "ריק";
  if (b.type === "image") return b.caption || "";
  if (b.type === "details" || b.type === "live") return b.texts.title?.trim() || "";
  return "";
}
