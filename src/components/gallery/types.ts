import type { MediaDTO } from "../../../shared/types";

export interface ViewProps {
  items: MediaDTO[];
  fresh: Set<string>;
  albumName: (id: string) => string;
  onOpen: (index: number) => void;
  onNeedUrl: (ids: string[], force?: boolean) => void;
  /** group headers for the timeline order */
  groupBy?: "hour" | null;
  eventCode: string;
}
