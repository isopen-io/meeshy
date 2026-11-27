/**
 * La présence qu'un lien SERVAIT, rejugée après qu'il a changé (#19539).
 *
 * `user:status` n'atteint que l'audience que la loi retient AU MOMENT de la transition
 * (`presence-audience.ts`), et `presence:snapshot` ne part qu'à l'authentification de la
 * socket. Un lien qui descend sous Ami, ou une amitié rompue, sortait donc l'autre de
 * l'audience SANS lui dire que la présence qu'il tenait ne lui était plus servie : sa
 * pastille verte restait figée jusqu'à sa propre reconnexion. Même défaut pour un Proche
 * redevenu Ami, qui gardait un `lastActiveAt` que la loi ne lui sert plus (#13928).
 *
 * Le patron est celui de la batterie, de l'écoute et de la position : une CAPTURE de ce
 * que chacun des deux voit de l'autre avant l'écriture, puis, après, une seule charge
 * `user:status` vers la room du lecteur dont la présence SERVIE a changé — la forme d'une
 * transition ordinaire (`isOnline`, `lastActiveAt` nul quand la loi le tait), jamais un
 * événement qui nomme la baisse (RG-07). Rien ne part quand la valeur servie est la même,
 * et rien ne part vers un tiers. La loi reste `resolvePresenceVisibility`, interrogée par
 * la porte des ÉVÉNEMENTS poussés (`resolveForPresenceEvent`, où un blocage l'emporte).
 *
 * Un échec n'arrête jamais le geste : il est remis à `report`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { getPresenceVisibilityService } from '../PresenceVisibilityService';
import { ACCOUNT_STATE_SELECT, lawRoleOf } from '../relations/usableAccount';
import type { ServerEmitIO } from '../../socketio/serverEmit';

type Params = { readonly prisma: PrismaClient; readonly io: ServerEmitIO | undefined; readonly report: (error: unknown) => void };
type Pair = { readonly userA: string; readonly userB: string };

type ServedPresence = { readonly isOnline: boolean; readonly lastActiveAt: Date | null };

/** Ce que chaque LECTEUR de la paire voit de l'autre, par identifiant du lecteur. */
export type PresencePairServed = ReadonlyMap<string, ServedPresence>;

type Person = {
  readonly id: string;
  readonly role: string | null;
  readonly isActive?: boolean | null;
  readonly deletedAt?: Date | null;
  readonly deactivatedAt?: Date | null;
  readonly isOnline?: boolean | null;
  readonly lastActiveAt?: Date | null;
  readonly username?: string | null;
  readonly displayName?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
};

const PERSON_SELECT = {
  id: true, role: true, isOnline: true, lastActiveAt: true,
  username: true, displayName: true, firstName: true, lastName: true,
  ...ACCOUNT_STATE_SELECT,
} as const;

const readPerson = async (prisma: PrismaClient, id: string): Promise<Person | null> =>
  (await prisma.user.findUnique({ where: { id }, select: PERSON_SELECT })) as Person | null;

const displayNameOf = (person: Person): string =>
  person.displayName || `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || person.username || person.id;

async function servedTo(prisma: PrismaClient, reader: Person, subject: Person): Promise<ServedPresence> {
  const viewer = { userId: reader.id, role: (lawRoleOf(reader as Parameters<typeof lawRoleOf>[0]) ?? 'USER') as GlobalUserRoleType };
  const visibility = (await getPresenceVisibilityService(prisma).resolveForPresenceEvent(viewer, [subject.id])).get(subject.id);
  return {
    isOnline: visibility?.showOnline === true && subject.isOnline === true,
    lastActiveAt: visibility?.showLastSeenTimestamp === true ? subject.lastActiveAt ?? null : null,
  };
}

async function readPair(prisma: PrismaClient, pair: Pair): Promise<{ people: readonly [Person, Person]; served: PresencePairServed } | null> {
  const [a, b] = await Promise.all([readPerson(prisma, pair.userA), readPerson(prisma, pair.userB)]);
  if (a === null || b === null) return null;
  const [aSeesB, bSeesA] = await Promise.all([servedTo(prisma, a, b), servedTo(prisma, b, a)]);
  return { people: [a, b], served: new Map([[a.id, aSeesB], [b.id, bSeesA]]) };
}

const sameServed = (left: ServedPresence | undefined, right: ServedPresence): boolean =>
  left !== undefined && left.isOnline === right.isOnline && (left.lastActiveAt?.getTime() ?? null) === (right.lastActiveAt?.getTime() ?? null);

/** À appeler AVANT l'écriture du lien ; une lecture ratée rend une capture vide, qui ne fait rien partir. */
export async function capturePresenceBefore(params: Params, pair: Pair): Promise<PresencePairServed> {
  try {
    return (await readPair(params.prisma, pair))?.served ?? new Map();
  } catch (error) {
    params.report(error);
    return new Map();
  }
}

/**
 * À appeler APRÈS l'écriture et l'oubli des caches d'amis : chaque lecteur dont la présence
 * servie a changé reçoit, dans SA room, la transition que la loi lui sert désormais. Sans
 * capture pour un lecteur, rien ne part vers lui — on n'émet jamais sur la foi d'une panne.
 */
export async function refreshPresenceAfter(params: Params, pair: Pair & { readonly before: PresencePairServed }): Promise<void> {
  try {
    const after = await readPair(params.prisma, pair);
    if (after === null || params.io === undefined) return;
    const [a, b] = after.people;
    for (const [reader, subject] of [[a, b], [b, a]] as const) {
      const served = after.served.get(reader.id)!;
      const before = pair.before.get(reader.id);
      if (before === undefined || sameServed(before, served)) continue;
      params.io.to(ROOMS.user(reader.id)).emit(SERVER_EVENTS.USER_STATUS, {
        userId: subject.id,
        username: displayNameOf(subject),
        isOnline: served.isOnline,
        lastActiveAt: served.lastActiveAt,
      });
    }
  } catch (error) {
    params.report(error);
  }
}
