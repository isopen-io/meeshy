import type { PhoneCallAnnouncementKind } from '@meeshy/shared/types/phone-call';

import { pillAnnouncementStore, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';

/**
 * **« EN APPEL » SUR LA PASTILLE** (#18753, ACT-01) — l'annonce que `phone-call:started` / `phone-call:ended` servent
 * quand le lecteur est en conversation avec l'émetteur (la passerelle en décide) : « Jacques est en appel », puis
 * « Jacques a raccroché ». Le ton est NEUTRE : être en appel n'est pas une alerte, et aucune notification ne part.
 * Une clé par personne : l'annonce de la même personne remplace celle qui attend. La pastille ne range rien et ne
 * persiste JAMAIS. Module LÉGER, sans catalogue.
 */

const keyOf = (userId: string): string => `call:${userId}`;

export function announcePhoneCallOnPill({
  store = pillAnnouncementStore,
  userId,
  text,
  kind,
  now,
}: {
  readonly store?: PillAnnouncementStoreApi;
  readonly userId: string;
  readonly text: string;
  readonly kind: PhoneCallAnnouncementKind;
  readonly now: number;
}): void {
  store.getState().announce({
    id: `${keyOf(userId)}:${kind}:${now}`,
    key: keyOf(userId),
    text,
    tone: 'good',
    icon: { kind: 'call', active: kind === 'started' },
    at: now,
  });
}
