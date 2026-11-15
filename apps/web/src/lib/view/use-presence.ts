import { useEffect, useRef, useState } from 'react';

import type { UserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { livePresenceOf, presenceStore, type PresenceState, type PresenceStoreApi } from '@/lib/api/presence-store';
import type { Participant } from '@/lib/api/types';

import { createIntervalClock, type IntervalClock } from './interval-clock';
import { presenceKeyOf, presenceOf } from './conversation';
import { useViewer } from './use-viewer';

/**
 * L'HORLOGE DE LA PRÉSENCE (#10571) — un SEUL minuteur à 30 s pour toutes les
 * pastilles, miroir du minuteur de `PresenceManager.swift` : la loi 1/3/5
 * franchit ses seuils sans qu'aucun événement n'arrive, et c'est elle qui fait
 * passer un pair parti du vert à l'orange, puis au gris, puis à rien.
 */
export const presenceClock: IntervalClock = createIntervalClock(30_000);

/**
 * UNE PERSONNE QU'UNE VUE NOMME (#11412) — son identifiant quand la vue le
 * connaît (un membre actif, un visage de la rampe), et la charge REST qui la
 * porte quand elle a été servie. L'un ou l'autre peut manquer.
 */
export type PresenceSubject = {
  readonly userId: string | undefined;
  readonly participant: Participant | undefined;
};

/**
 * La présence SERVIE : la carte vivante d'abord (par l'identifiant nommé, sinon
 * la clé du participant), la charge REST sinon. SA PROPRE pastille ne se peint
 * jamais (décision porteur 2026-10-21, #11412) : la passerelle sert sa présence
 * à soi-même, et son propre post ou son message en groupe la portaient.
 */
function servedPresenceOfSubject(
  state: Pick<PresenceState, 'byUser'>,
  { userId, participant }: PresenceSubject,
  now: number,
  selfId: string | null,
): UserPresenceStatus {
  const key = userId ?? presenceKeyOf(participant);
  if (key !== undefined && key === selfId) return 'offline';
  return livePresenceOf(state, key, now) ?? presenceOf(participant, now);
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
  return usePresencesOf(participants.map((participant) => ({ userId: undefined, participant })), options);
}

export function usePresence(participant: Participant | undefined, options?: PresenceHookOptions): UserPresenceStatus {
  return usePresences([participant], options)[0] ?? 'offline';
}

/**
 * LES PASTILLES DE PERSONNES NOMMÉES (#11412) — un membre actif que la
 * passerelle n'a pas compté parmi les participants servis (elle en tronque la
 * liste), un visage de la rampe du résumé : la carte vivante les connaît par
 * leur identifiant, même quand aucune charge REST ne les porte.
 */
export function usePresencesOf(
  subjects: readonly PresenceSubject[],
  options: PresenceHookOptions = {},
): readonly UserPresenceStatus[] {
  const selfId = useViewer().id;
  return useResolvedPresences((state, at) => subjects.map((subject) => servedPresenceOfSubject(state, subject, at, selfId)), options);
}

export function usePresenceOf(subject: PresenceSubject, options?: PresenceHookOptions): UserPresenceStatus {
  return usePresencesOf([subject], options)[0] ?? 'offline';
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
  const selfId = useViewer().id;
  return useResolvedPresences(
    (state, at) => userIds.map((userId) => (userId === selfId ? 'offline' : (livePresenceOf(state, userId, at) ?? 'offline'))),
    options,
  );
}

export function usePresenceOfUser(userId: string | undefined, options?: PresenceHookOptions): UserPresenceStatus {
  return usePresencesOfUsers([userId], options)[0] ?? 'offline';
}
