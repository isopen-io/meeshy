import type { QueryClient } from '@tanstack/react-query';
import { getUserPresenceStatus, type UserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { knownPerson, type KnownPerson } from '@/lib/profile/known-people';

/**
 * **CE QUE LA LISTE DES CONVERSATIONS SAIT DÉJÀ D'UNE PERSONNE** (profil lent
 * dans la coque Android) — le second recours de l'amorce d'une fiche.
 *
 * `rememberPerson` n'est nourri que par un TOUCHER qui passe par
 * `peekProfileOnClick` : une fiche ouverte autrement — une adresse `/u/jcnm`
 * suivie depuis une notification, un lien partagé, une recherche, la coque
 * qui démarre dessus — n'avait rien pour son premier rendu, et restait sur le
 * squelette nu le temps de l'aller-retour (plus de 9 s observées en
 * production). Or la personne est très souvent DÉJÀ dans le cache : la liste
 * des conversations (`CONVERSATIONS_QUERY_KEY`, persistée sur le disque) porte
 * pour chaque participant son `user` — identifiant, pseudo, nom, avatar —
 * tels que `core-list.ts` les sert.
 *
 * On n'y lit QUE l'identité, jamais une relation ni une présence : la même
 * loi que `known-people.ts`. L'identifiant (`User.id`) en fait partie : il
 * permet aux lectures qui en dépendent (les conversations partagées) de
 * partir AVEC la fiche plutôt qu'après elle.
 *
 * La lecture est TOLÉRANTE : le cache est la charge brute du serveur, telle
 * que persistée — une page mal formée se saute, elle ne fait pas tomber
 * l'écran qui ne cherchait qu'un nom.
 */
export function knownPersonOrCached(client: QueryClient, handle: string): KnownPerson | null {
  return knownPerson(handle) ?? knownPersonInConversations(client, handle);
}

type Loose = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): Loose | null => (value !== null && typeof value === 'object' ? (value as Loose) : null);
const asList = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const filled = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

function participantsInConversations(client: QueryClient): readonly KnownPerson[] {
  const data = asRecord(client.getQueryData(CONVERSATIONS_QUERY_KEY));
  return asList(data?.pages).flatMap((page) =>
    asList(asRecord(page)?.conversations).flatMap((conversation) =>
      asList(asRecord(conversation)?.participants).flatMap((entry) => {
        const participant = asRecord(entry);
        const user = asRecord(participant?.user);
        const username = filled(user?.username);
        if (username === null) return [];
        return [
          {
            username,
            displayName: filled(user?.displayName) ?? filled(participant?.displayName),
            avatar: filled(user?.avatar) ?? filled(participant?.avatar),
            id: filled(user?.id) ?? filled(participant?.userId),
          },
        ];
      }),
    ),
  );
}

export function knownPersonInConversations(client: QueryClient, handle: string): KnownPerson | null {
  const key = handle.trim().toLowerCase();
  if (key === '') return null;
  return participantsInConversations(client).find((person) => person.username.toLowerCase() === key) ?? null;
}

/** La même lecture, par `User.id` : un événement qui ne nomme personne (le Bring, #13936) se nomme ainsi. */
export function knownPersonByIdInConversations(client: QueryClient, userId: string): KnownPerson | null {
  if (userId === '') return null;
  return participantsInConversations(client).find((person) => person.id === userId) ?? null;
}

/**
 * La présence que la liste des conversations a DÉJÀ servie pour cette personne (#16984) :
 * `undefined` quand elle n'y est pas, ou que le serveur n'a servi ni `isOnline` ni
 * `lastActiveAt` (présence masquée par la loi d'amitié) — jamais déduite, jamais « hors
 * ligne » par défaut : une présence absente ne dessine rien.
 */
export function servedPresenceByIdInConversations(client: QueryClient, userId: string, now: number = Date.now()): UserPresenceStatus | undefined {
  if (userId === '') return undefined;
  const data = asRecord(client.getQueryData(CONVERSATIONS_QUERY_KEY));
  const users = asList(data?.pages).flatMap((page) =>
    asList(asRecord(page)?.conversations).flatMap((conversation) =>
      asList(asRecord(conversation)?.participants).flatMap((entry) => {
        const participant = asRecord(entry);
        const user = asRecord(participant?.user);
        return filled(user?.id) === userId || filled(participant?.userId) === userId ? [user ?? participant] : [];
      }),
    ),
  );
  const served = users.find((user) => typeof user?.isOnline === 'boolean' || filled(user?.lastActiveAt) !== null);
  if (served === undefined || served === null) return undefined;
  const lastActiveAt = filled(served.lastActiveAt);
  return getUserPresenceStatus({ isOnline: served.isOnline === true, ...(lastActiveAt === null ? {} : { lastActiveAt }) }, now);
}
