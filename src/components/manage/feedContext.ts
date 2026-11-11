import { createContext, useContext } from "react";
import type { Feed } from "../../lib/useFeed";

/** The manage page's live feed of the event's photos (one feed for the whole page - the design editor reads it too). */
export const ManageFeedContext = createContext<Feed | null>(null);
export const useManageFeed = () => useContext(ManageFeedContext);
