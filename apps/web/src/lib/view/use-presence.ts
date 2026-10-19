import { useEffect, useRef, useState } from 'react';

import type { UserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { livePresenceOf, presenceStore, type PresenceState, type PresenceStoreApi } from '@/lib/api/presence-store';
import type { Participant } from '@/lib/api/types';

import { createIntervalClock, type IntervalClock } from './interval-clock';
import { presenceKeyOf, presenceOf } from './conversation';

/**
 * L'HORLOGE DE LA PRÉSENCE (#10571) — un SEUL minuteur à 30 s pour toutes les
 * pastilles, miroir du minuteur de `PresenceManager.swift` : la loi 1/3/5
 * franchit ses seuils sans qu'aucun événement n'arrive, et c'est elle qui fait
 * passer un pair parti du vert à l'orange, puis au gris, puis à rien.
 */
export const presenceClock: IntervalClock = createIntervalClock(30_000);

/** La présence SERVIE d'un participant : la carte vivante d'abord, la charge REST sinon. */
export function servedPresenceOf(
  state: Pick<PresenceState, 'byUser'>,
  participant: Participant | undefined,
  now: number,
): UserPresenceStatus {
  return livePresenceOf(state, presenceKeyOf(participant), now) ?? presenceOf(participant, now);
}

type PresenceHookOptions = {
  readonly now?: () => number;
  readonly store?: PresenceStoreApi;
  readonly clock?: IntervalClock;
};

/**
 * LES PASTILLES D'UNE VUE, TENUES À JOUR. La vue se repeint quand l'une de SES
 * pastilles change — un `user:status`, une frappe, un seuil franchi — et
 * jamais pour la transition d'un autre : une bulle de Bob ne se repeint pas
 * quand Carol se connecte, ni toutes les 30 s quand rien n'a bougé.
 */
function useResolvedPresences(
  resolveAt: (state: PresenceState, at: number) => readonly UserPresenceStatus[],
  { now = Date.now, store = presenceStore, clock = presenceClock }: PresenceHookOptions,
): readonly UserPresenceStatus[] {
  const resolve = (): readonly UserPresenceStatus[] => resolveAt(store.getState(), now());
  const statuses = resolve();
  const shown = useRef({ resolve, signature: statuses.join('|') });
  shown.current = { resolve, signature: statuses.join('|') };
  const [, repaint] = useState(0);

  useEffect(() => {
    const check = (): void => {
      if (shown.current.resolve().join('|') !== shown.current.signature) repaint((n) => n + 1);
    };
    const unstore = store.subscribe(check);
    const unclock = clock.subscribe(check);
    return () => {
      unstore();
      unclock();
    };
  }, [store, clock]);

  return statuses;
}

export function usePresences(
  participants: readonly (Participant | undefined)[],
  options: PresenceHookOptions = {},
): readonly UserPresenceStatus[] {
  return useResolvedPresences((state, at) => participants.map((participant) => servedPresenceOf(state, participant, at)), options);
}

export function usePresence(participant: Participant | undefined, options?: PresenceHookOptions): UserPresenceStatus {
  return usePresences([participant], options)[0] ?? 'offline';
}

/**
 * LA PRÉSENCE D'UNE PERSONNE CONNUE PAR SON SEUL IDENTIFIANT (#10944) — l'auteur
 * d'un post, d'un commentaire, d'une notification : la charge n'en porte
 * aucune, et la carte vivante (`user:status`, `presence:snapshot`) est la seule
 * présence que la passerelle a SERVIE à ce lecteur. Absente ⇒ `offline`,
 * c'est-à-dire aucun point : rien ne se fabrique.
 */
export function usePresencesOfUsers(
  userIds: readonly (string | undefined)[],
  options: PresenceHookOptions = {},
): readonly UserPresenceStatus[] {
  return useResolvedPresences((state, at) => userIds.map((userId) => livePresenceOf(state, userId, at) ?? 'offline'), options);
}

export function usePresenceOfUser(userId: string | undefined, options?: PresenceHookOptions): UserPresenceStatus {
  return usePresencesOfUsers([userId], options)[0] ?? 'offline';
}
