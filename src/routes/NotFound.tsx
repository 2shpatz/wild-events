import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <SearchX className="size-14 text-muted-fg" aria-hidden />
      <h1 className="text-2xl font-bold">הדף לא נמצא</h1>
      <p className="max-w-sm text-muted-fg">ייתכן שהקישור שגוי או שהאירוע הוסר. כדאי לבדוק את הקישור שקיבלתם.</p>
      <Link to="/" className="font-semibold text-primary underline">
        לעמוד הראשי
      </Link>
    </main>
  );
}
