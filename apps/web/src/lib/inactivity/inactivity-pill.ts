import type { InactivityAnnouncementKind } from '@meeshy/shared/types/inactivity-check';

import { pillAnnouncementStore, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';

/**
 * **L'ALERTE D'INACTIVITÉ SUR LA PASTILLE** (#18738, TEL-02) — l'annonce que `inactivity:alert` / `inactivity:cleared`
 * servent, quel que soit l'écran : « Jacques n'a pas répondu à « Tout va bien ? » », puis « Jacques va bien ».
 * Une clé par personne : l'annonce de la même personne remplace celle qui attend. La pastille ne range rien et ne
 * persiste JAMAIS. À la différence de la batterie, la notification `inactivity_alert` garde sa bannière : une alerte de
 * sécurité part par les deux canaux (décision gateway du 2026-11-18, point 3). Module LÉGER, sans catalogue.
 */

const keyOf = (userId: string): string => `inactivity:${userId}`;

export function announceInactivityOnPill({
  store = pillAnnouncementStore,
  userId,
  text,
  kind,
  now,
}: {
  readonly store?: PillAnnouncementStoreApi;
  readonly userId: string;
  readonly text: string;
  readonly kind: InactivityAnnouncementKind;
  readonly now: number;
}): void {
  store.getState().announce({
    id: `${keyOf(userId)}:${kind}:${now}`,
    key: keyOf(userId),
    text,
    tone: kind === 'alert' ? 'alert' : 'good',
    icon: { kind: 'inactivity', responded: kind === 'responded' },
    at: now,
  });
}
