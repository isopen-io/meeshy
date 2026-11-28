/**
 * Le lien Ami qu'une inscription par parrainage vient de nouer (#19540), annoncé
 * comme une acceptation ordinaire (`friend-request-answer.ts`) : `relation:level-raised`
 * aux deux, `friend-request:accepted` à l'expéditeur de la demande acceptée, les
 * caches d'amis oubliés, et l'écoute, la batterie et la position partagée rejouées
 * pour la paire. Rien ne part vers un tiers. Ne fait jamais échouer l'inscription.
 */
import type { FastifyInstance } from 'fastify';
import { logError } from '../utils/logger';
import { emitRelationLevelRaised, relationIoOf, type RelationIo } from '../socketio/relationEvents';
import { forgetFriends } from './relations/relationCaches';
import { refreshNowPlayingAfter } from './nowPlaying/nowPlayingDeps';
import { refreshBatteryAfter } from './battery/batteryDeps';
import { refreshSharedLocationAfter } from './sharedLocation/sharedLocationDeps';

export type AffiliateFriendshipLinked = {
  readonly sponsorId: string;
  readonly referredId: string;
  /** Le lien est né ou a monté à Ami : `recordFriendship` a rendu `created` ou `raised`. */
  readonly levelRaised: boolean;
  /** La demande que la conversion vient d'accepter (créée acceptée ou promue), sinon `null`. */
  readonly acceptedRequest: { readonly id: string; readonly senderId: string; readonly receiverId: string } | null;
};

export type AffiliateFriendshipDeps = {
  readonly io: RelationIo | undefined;
  readonly notifyAccepted: (params: { senderId: string; friendRequestId: string; accepterId: string }) => void;
  readonly forget: (ids: ReadonlyArray<string>) => Promise<void>;
  readonly refreshPair: (pair: { readonly userA: string; readonly userB: string }) => Promise<void>;
  readonly now: () => Date;
};

const quietly = async (step: () => Promise<void> | void): Promise<void> => {
  try {
    await step();
  } catch {
    /* le lien est écrit ; l'annonce n'est qu'un écho */
  }
};

export async function announceAffiliateFriendship(deps: AffiliateFriendshipDeps, linked: AffiliateFriendshipLinked): Promise<void> {
  const pair = { userA: linked.sponsorId, userB: linked.referredId };
  await quietly(() => deps.forget([pair.userA, pair.userB]));
  if (linked.levelRaised) {
    await quietly(() => emitRelationLevelRaised(deps.io, { ...pair, level: 'FRIEND', at: deps.now() }));
    await quietly(() => deps.refreshPair(pair));
  }
  const request = linked.acceptedRequest;
  if (request) {
    await quietly(() => deps.notifyAccepted({ senderId: request.senderId, friendRequestId: request.id, accepterId: request.receiverId }));
  }
}

/** Le branchement des deux portes de conversion : l'annonce part sans être attendue. */
export function affiliateFriendshipAnnouncer(fastify: FastifyInstance): (linked: AffiliateFriendshipLinked) => void {
  const report = (what: string) => (error: unknown) => logError(fastify.log, what, error);
  const deps: AffiliateFriendshipDeps = {
    get io() { return relationIoOf(fastify); },
    notifyAccepted: (params) => fastify.notificationService?.emitFriendRequestAccepted(params),
    forget: (ids) => forgetFriends(fastify, ids),
    refreshPair: async (pair) => {
      const params = { prisma: fastify.prisma, io: relationIoOf(fastify) };
      await refreshNowPlayingAfter({ ...params, report: report('Now playing not refreshed after referral:') }, pair);
      await refreshBatteryAfter({ ...params, report: report('Battery not refreshed after referral:') }, pair);
      await refreshSharedLocationAfter({ ...params, report: report('Shared location not refreshed after referral:') }, pair);
    },
    now: () => new Date(),
  };
  return (linked) => {
    void announceAffiliateFriendship(deps, linked).catch(() => undefined);
  };
}
