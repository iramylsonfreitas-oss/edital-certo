import { unstable_cache } from "next/cache";
import { fetchPublicPncpCatalog } from "./public-catalog";

// Only the public PNCP projection is shared. User sessions, queries and tenant rows never enter this cache.
export const fetchCachedPublicPncpCatalog = unstable_cache(fetchPublicPncpCatalog,
  ["pncp-public-catalog-compact-v1"], { revalidate: 900 });
