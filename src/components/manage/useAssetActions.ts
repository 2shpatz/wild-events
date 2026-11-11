import { useMemo } from "react";
import { MAX_FEATURED, type ManageEvent } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { compressBackground } from "../ThemePicker";
import { useToast } from "../ui";

const jpeg = { "Content-Type": "image/jpeg" };

/** Upload / remove the guest page images (header, invitation, featured photos); each reloads the event. */
export function useAssetActions(event: ManageEvent, onChanged: () => void) {
  const toast = useToast();
  return useMemo(() => {
    const put = async (path: string, f: File, edge: number, msg: string) => {
      try {
        await api(`/e/${event.code}/manage/${path}`, { method: "PUT", body: await compressBackground(f, edge), headers: jpeg });
        toast(msg);
      } catch (e) {
        toast(errorMessage(e), "error");
      }
      onChanged();
    };
    const del = async (path: string) => {
      await api(`/e/${event.code}/manage/${path}`, { method: "DELETE" }).catch(() => {});
      onChanged();
    };
    return {
      headerSrc: event.headerVersion ? `/api/e/${event.code}/asset/hd?v=${encodeURIComponent(event.headerVersion)}` : null,
      invitationSrc: event.invitationVersion ? `/api/e/${event.code}/asset/inv?v=${encodeURIComponent(event.invitationVersion)}` : null,
      featuredSlots: event.featured.map((f) => ({ slot: f.slot, src: `/api/e/${event.code}/asset/f${f.slot}?v=${encodeURIComponent(f.v)}` })),
      setHeader: (f: File) => put("header", f, 1600, "תמונת הכותרת עודכנה"),
      clearHeader: () => del("header"),
      // Larger edge than other assets: invitations carry small text that must stay readable when zoomed.
      setInvitation: (f: File) => put("invitation", f, 2200, "תמונת ההזמנה עודכנה"),
      clearInvitation: () => del("invitation"),
      addFeatured: async (files: File[]) => {
        const used = new Set(event.featured.map((f) => f.slot));
        const free = Array.from({ length: MAX_FEATURED }, (_, i) => i).filter((i) => !used.has(i));
        try {
          for (let i = 0; i < files.length && i < free.length; i++) {
            await api(`/e/${event.code}/manage/featured/${free[i]}`, { method: "PUT", body: await compressBackground(files[i], 1600), headers: jpeg });
          }
          toast("התמונות המייצגות נוספו");
        } catch (e) {
          toast(errorMessage(e), "error");
        }
        onChanged();
      },
      /** Copies photos from the event's album into the free featured slots (the server downloads them from Google). */
      addFeaturedFromMedia: async (ids: string[]) => {
        const used = new Set(event.featured.map((f) => f.slot));
        const free = Array.from({ length: MAX_FEATURED }, (_, i) => i).filter((i) => !used.has(i));
        try {
          for (let i = 0; i < ids.length && i < free.length; i++) {
            await api(`/e/${event.code}/manage/featured/${free[i]}/from-media`, { method: "POST", json: { mediaId: ids[i] } });
          }
          toast("התמונות המייצגות נוספו");
        } catch (e) {
          toast(errorMessage(e), "error");
        }
        onChanged();
      },
      removeFeatured: (slot: number) => del(`featured/${slot}`),
    };
  }, [event.code, event.headerVersion, event.invitationVersion, event.featured, onChanged, toast]);
}
