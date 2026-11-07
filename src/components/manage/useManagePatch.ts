import { useCallback } from "react";
import type { ManageEvent } from "../../../shared/types";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../ui";

/** PATCH /e/:code/manage with a toast, then reload the event. */
export function useManagePatch(event: ManageEvent, onChanged: () => void) {
  const toast = useToast();
  return useCallback(
    async (body: Record<string, unknown>, msg = "נשמר"): Promise<void> => {
      try {
        await api(`/e/${event.code}/manage`, { method: "PATCH", json: body });
        toast(msg);
        onChanged();
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },
    [event.code, onChanged, toast],
  );
}
