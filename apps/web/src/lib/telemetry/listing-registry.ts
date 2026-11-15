import type { ListingContext } from '@/lib/api/social-events-v2-types';

import type { ListingScrollAccumulator } from './scroll-accumulator';

/**
 * Les passages de listing VIVANTS (#10509), par `listingSessionId` — le
 * registre que l'impression d'une carte et le tirer-pour-rafraîchir
 * alimentent, et que `useListingScrollTelemetry` résume. Sans dépendance vers
 * la file : une carte peut s'y noter sans rien importer d'autre.
 */
export const listingAccumulators = new Map<string, ListingScrollAccumulator>();

/** Une carte comptée dans son listing (impression), lue par le résumé du passage. */
export function noteListingItem(listing: ListingContext | undefined, viewable: boolean): void {
  if (listing?.listingSessionId === undefined || listing.position === undefined) return;
  listingAccumulators.get(listing.listingSessionId)?.noteItem(listing.position, viewable);
}

/** Le tirer-pour-rafraîchir d'un listing. */
export function noteListingRefresh(listingSessionId: string): void {
  listingAccumulators.get(listingSessionId)?.noteRefresh();
}
