/**
 * #19539 — ce qu'un lien qui BAISSE retire de la présence, retiré chez qui la voyait.
 *
 * L'audience de `user:status` est recalculée à chaque transition
 * (`socketio/presence-audience.ts`) : dès la baisse, l'ancien Ami n'en fait plus
 * partie et ne reçoit plus AUCUNE transition — pas même la « hors ligne ». Sans
 * charge de retrait, il garde la pastille verte jusqu'à sa propre reconnexion, et
 * un Proche baissé à Ami garde de même une dernière connexion figée.
 *
 * Même patron que la batterie, l'écoute et la position (`refresh…After`) : la
 * visibilité de chaque sens est lue AVANT l'écriture, relue APRÈS, et seul le
 * lecteur qui a PERDU quelque chose reçoit une charge — exactement ce que la loi
 * lui sert désormais (`resolveForTarget`, jamais une comparaison de niveaux ici).
 * Sous Ami, c'est `isOnline` faux et `lastActiveAt` nul : un passage hors ligne
 * ordinaire, qui ne nomme pas la baisse (RG-07).
 *
 * Aucun échec n'arrête le geste : une capture ratée rend « rien vu », donc aucun
 * retrait ; un retrait raté se rattrape à la reconnexion du lecteur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import { getPresenceVisibilityService } from '../PresenceVisibilityService';
import { ACCOUNT_STATE_SELECT, lawRoleOf, type AccountState } from './usableAccount';
import type { ServerEmitIO } from '../../socketio/serverEmit';

export type PresenceDropParams = {
  readonly prisma: PrismaClient;
  readonly io: ServerEmitIO | undefined;
  readonly report: (error: unknown) => void;
  /**
   * La présence VIVANTE (socket au premier plan), celle que `user:status` et
   * `presence:snapshot` servent. La colonne `User.isOnline` est écrite sans attente et
   * peut retarder : elle n'est qu'un repli quand la passerelle n'a pas de gestionnaire.
   */
  readonly isPresent?: (userId: string) => boolean;
};

type PresenceFastify = {
  readonly socketIOHandler?: { getManager?: () => { isPresenceOnline?: (id: string) => boolean } | undefined } | null;
};

/** La présence vivante du gestionnaire de sockets de cette passerelle, quand il est monté. */
export const livePresenceOf = (fastify: PresenceFastify): ((userId: string) => boolean) | undefined => {
  const manager = fastify.socketIOHandler?.getManager?.();
  return typeof manager?.isPresenceOnline === 'function' ? (id) => manager.isPresenceOnline!(id) : undefined;
};

type Pair = { readonly userA: string; readonly userB: string };

/** Ce que chaque lecteur voyait de l'autre, clé = lecteur. */
export type PresencePairAccess = ReadonlyMap<string, PresenceVisibility>;

type Person = AccountState & {
  readonly id: string;
  readonly role: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly isOnline: boolean | null;
  readonly lastActiveAt: Date | null;
  readonly deactivatedAt: Date | null;
};

const PERSON_SELECT = {
  id: true, role: true, username: true, displayName: true, firstName: true, lastName: true,
  isOnline: true, lastActiveAt: true, ...ACCOUNT_STATE_SELECT,
} as const;

const readPerson = async (prisma: PrismaClient, id: string): Promise<Person | null> =>
  (await prisma.user.findUnique({ where: { id }, select: PERSON_SELECT })) as Person | null;

const nameOf = (person: Person): string =>
  person.displayName || `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || person.username || person.id;

const viewerOf = (person: Person) => ({ userId: person.id, role: (lawRoleOf(person) ?? 'USER') as GlobalUserRoleType });

async function visibilities(prisma: PrismaClient, pair: Pair): Promise<{ readonly people: readonly [Person, Person] | null; readonly access: PresencePairAccess }> {
  const [a, b] = await Promise.all([readPerson(prisma, pair.userA), readPerson(prisma, pair.userB)]);
  if (a === null || b === null) return { people: null, access: new Map() };
  const law = getPresenceVisibilityService(prisma);
  const [aSeesB, bSeesA] = await Promise.all([
    law.resolveForTarget(viewerOf(a), { id: b.id, deactivatedAt: b.deactivatedAt }),
    law.resolveForTarget(viewerOf(b), { id: a.id, deactivatedAt: a.deactivatedAt }),
  ]);
  return { people: [a, b], access: new Map([[a.id, aSeesB], [b.id, bSeesA]]) };
}

/** À appeler AVANT l'écriture du lien ; le résultat se passe à {@link refreshPresenceAfter}. */
export async function capturePresenceBefore(params: PresenceDropParams, pair: Pair): Promise<PresencePairAccess> {
  try {
    return (await visibilities(params.prisma, pair)).access;
  } catch (error) {
    params.report(error);
    return new Map();
  }
}

type Served = { readonly isOnline: boolean; readonly lastActiveAt: Date | null };

/** Ce que la loi sert d'une personne à un lecteur dont la visibilité est `access` : la forme de `user:status`. */
const served = (access: PresenceVisibility, subject: Person, isPresent: PresenceDropParams['isPresent']): Served => ({
  isOnline: access.showOnline && (isPresent ? isPresent(subject.id) : subject.isOnline === true),
  lastActiveAt: access.showLastSeenTimestamp ? subject.lastActiveAt : null,
});

const sameServed = (a: Served, b: Served): boolean =>
  a.isOnline === b.isOnline && a.lastActiveAt?.getTime() === b.lastActiveAt?.getTime();

/**
 * À appeler APRÈS l'écriture et l'oubli des caches d'amis. Un lecteur ne reçoit une charge
 * que si ce que la loi lui sert de l'autre CHANGE : une baisse qui ne retire rien de visible
 * (l'autre était déjà hors ligne et la dernière connexion déjà tue) reste muette, comme RG-07
 * le veut. Une montée n'est pas ce site : elle rend la présence à la transition suivante.
 */
export async function refreshPresenceAfter(params: PresenceDropParams, pair: Pair & { readonly before: PresencePairAccess }): Promise<void> {
  try {
    const { people, access } = await visibilities(params.prisma, pair);
    if (people === null) return;
    const [a, b] = people;
    for (const [viewer, subject] of [[a, b], [b, a]] as const) {
      const before = pair.before.get(viewer.id);
      const after = access.get(viewer.id);
      if (before === undefined || after === undefined) continue;
      const now = served(after, subject, params.isPresent);
      if (sameServed(served(before, subject, params.isPresent), now)) continue;
      params.io?.to(ROOMS.user(viewer.id)).emit(SERVER_EVENTS.USER_STATUS, { userId: subject.id, username: nameOf(subject), ...now });
    }
  } catch (error) {
    params.report(error);
  }
}
