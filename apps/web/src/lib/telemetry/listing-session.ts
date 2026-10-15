import { useState } from 'react';

import { newEngagementSessionId } from '@/lib/api/social-events';

/**
 * Le PASSAGE dans un listing (#10501, #10509) — un identifiant par montage de
 * l'écran, que portent ses impressions et son résumé de défilement. Stable
 * tant que l'écran est monté ; aucun stockage.
 */
export function useListingSessionId(): string {
  const [id] = useState(newEngagementSessionId);
  return id;
}
