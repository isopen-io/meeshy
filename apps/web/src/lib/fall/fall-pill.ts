import { pillAnnouncementStore, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';

import type { FallPillKind } from './fall-live';

/**
 * **LA CHUTE DÉTECTÉE SUR LA PASTILLE** (#18748, SAN-01) — l'annonce que `fall:detected` (avec annonce) et
 * `fall:cleared` (`responded`) servent, quel que soit l'écran : « Une chute a été détectée sur la montre d'Awa », puis
 * « Awa va bien ». Une clé par personne : l'annonce de la même personne remplace celle qui attend. La pastille ne range
 * rien et ne persiste JAMAIS. Le push générique part de son côté (décision gateway du 2026-11-19, point 7). Module
 * LÉGER, sans catalogue.
 */

const keyOf = (userId: string): string => `fall:${userId}`;

export function announceFallOnPill({
  store = pillAnnouncementStore,
  userId,
  text,
  kind,
  now,
}: {
  readonly store?: PillAnnouncementStoreApi;
  readonly userId: string;
  readonly text: string;
  readonly kind: FallPillKind;
  readonly now: number;
}): void {
  store.getState().announce({
    id: `${keyOf(userId)}:${kind}:${now}`,
    key: keyOf(userId),
    text,
    tone: kind === 'detected' ? 'alert' : 'good',
    icon: { kind: 'fall', responded: kind === 'responded' },
    at: now,
  });
}
