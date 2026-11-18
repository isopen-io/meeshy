/**
 * L'EFFECTIF d'une communauté en temps réel (#18766, seconde tranche de
 * #16857) — `community:member-joined`, `community:member-left`,
 * `community:member-role-updated`.
 *
 * Rejoindre, quitter, être invité, ajouté, retiré ou changer de rôle
 * n'émettait rien : le compteur du détail, la liste des membres et le rôle du
 * lecteur mentaient chez les autres membres jusqu'à la péremption de leur
 * cache. Chaque geste diffuse désormais ce qui vient d'être écrit.
 *
 * Règles, gardées par `__tests__/unit/services/community-member-broadcast.test.ts` :
 *  - l'audience est la room personnelle de chaque membre ACTIF après
 *    l'écriture, du créateur, et de la personne CONCERNÉE (elle apprend son
 *    propre départ ou retrait sur ses autres appareils), une fois chacun —
 *    jamais un ancien membre tiers, jamais un non-membre ;
 *  - une communauté désactivée ou disparue n'annonce rien ;
 *  - la charge ne nomme la personne que par son identifiant : ni profil, ni
 *    présence, ni coordonnées (`CommunityMember*EventData`) ;
 *  - la porte « lien » d'une entrée ne part qu'au créateur, aux
 *    administrateurs, aux modérateurs et à l'arrivant ; un membre simple lit
 *    `self` (#19429, même règle que la liste des membres) ;
 *  - un envoi qui lève n'arrête pas les autres.
 *
 * Travail ASYNCHRONE, comme `community:updated` : les routes l'appellent par
 * `scheduleCommunityMemberBroadcastFrom`, après la réponse.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  SERVER_EVENTS,
  type CommunityMemberJoinVia,
  type CommunityMemberJoinedEventData,
  type CommunityMemberLeftEventData,
  type CommunityMemberLeftReason,
  type CommunityMemberRole,
  type CommunityMemberRoleUpdatedEventData,
} from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { deferAfterResponse, type AfterResponse } from '../utils/after-response.js';
import { broadcastToUser } from '../utils/socket-broadcast';
import { announceCommunityLinkEntry } from './community-link-entry-announce';
import { linkActivityRelayOf } from '../socketio/linkActivityEvents';

const logger = enhancedLogger.child({ module: 'CommunityMemberBroadcast' });

export type CommunityMemberChange =
  | {
      readonly kind: 'joined';
      readonly communityId: string;
      readonly userId: string;
      readonly role: CommunityMemberRole;
      readonly via: CommunityMemberJoinVia;
    }
  | {
      readonly kind: 'left';
      readonly communityId: string;
      readonly userId: string;
      readonly reason: CommunityMemberLeftReason;
    }
  | {
      readonly kind: 'role-updated';
      readonly communityId: string;
      readonly userId: string;
      readonly role: CommunityMemberRole;
    };

/** Le couple (événement, charge), corrélé par construction. */
export type CommunityMemberEmission =
  | { readonly event: typeof SERVER_EVENTS.COMMUNITY_MEMBER_JOINED; readonly payload: CommunityMemberJoinedEventData }
  | { readonly event: typeof SERVER_EVENTS.COMMUNITY_MEMBER_LEFT; readonly payload: CommunityMemberLeftEventData }
  | { readonly event: typeof SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED; readonly payload: CommunityMemberRoleUpdatedEventData };

export type CommunityMemberBroadcastDeps = {
  readonly prisma: Pick<PrismaClient, 'community' | 'communityMember'>;
  readonly deliver: (userId: string, emission: CommunityMemberEmission) => void;
  readonly now?: () => Date;
};

/** Un rôle stocké hors de la taxonomie se lit `member`, le rang le plus bas. */
export function communityMemberRoleOf(stored: string | null | undefined): CommunityMemberRole {
  return stored === 'admin' || stored === 'moderator' ? stored : 'member';
}

function emissionFor(change: CommunityMemberChange, memberCount: number, at: string): CommunityMemberEmission {
  const { communityId, userId } = change;
  switch (change.kind) {
    case 'joined':
      return {
        event: SERVER_EVENTS.COMMUNITY_MEMBER_JOINED,
        payload: { communityId, userId, role: change.role, via: change.via, memberCount, at },
      };
    case 'left':
      return {
        event: SERVER_EVENTS.COMMUNITY_MEMBER_LEFT,
        payload: { communityId, userId, reason: change.reason, memberCount, at },
      };
    case 'role-updated':
      return {
        event: SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED,
        payload: { communityId, userId, role: change.role, memberCount, at },
      };
  }
}

/**
 * Ce qu'en lit un membre SIMPLE (#19429) : la porte « lien » ne part qu'à ceux
 * qui animent ou modèrent — la règle de `GET /communities/:id/members`, qui
 * masque `joinedVia` aux autres. Le membre simple lit une entrée « de soi-même ».
 */
function plainMemberEmission(change: CommunityMemberChange, memberCount: number, at: string): CommunityMemberEmission {
  return change.kind === 'joined' && change.via === 'link'
    ? emissionFor({ ...change, via: 'self' }, memberCount, at)
    : emissionFor(change, memberCount, at);
}

export async function broadcastCommunityMemberChange(
  deps: CommunityMemberBroadcastDeps,
  change: CommunityMemberChange,
): Promise<number> {
  const community = await deps.prisma.community.findFirst({
    where: { id: change.communityId, isActive: true },
    select: { id: true, createdBy: true },
  });
  if (!community) return 0;

  const members = await deps.prisma.communityMember.findMany({
    where: { communityId: change.communityId, isActive: true },
    select: { userId: true, role: true },
  });

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const emission = emissionFor(change, members.length, at);
  const plain = plainMemberEmission(change, members.length, at);
  const seesEntry = new Set([
    community.createdBy,
    change.userId,
    ...members.filter((m) => m.role === 'admin' || m.role === 'moderator').map((m) => m.userId),
  ]);
  const audience = [...new Set([...members.map((m) => m.userId), community.createdBy, change.userId])];

  const delivered = audience.map((userId) => {
    try {
      deps.deliver(userId, seesEntry.has(userId) ? emission : plain);
      return 1;
    } catch (error) {
      logger.warn('community member emit failed', { communityId: change.communityId, event: emission.event, error });
      return 0;
    }
  });
  return delivered.reduce<number>((sum, one) => sum + one, 0);
}

export function scheduleCommunityMemberBroadcast(
  deps: CommunityMemberBroadcastDeps,
  change: CommunityMemberChange,
  options: { readonly afterResponse?: AfterResponse } = {},
): void {
  (options.afterResponse ?? deferAfterResponse)(async () => {
    try {
      await broadcastCommunityMemberChange(deps, change);
    } catch (error) {
      logger.warn('community member broadcast failed', { communityId: change.communityId, kind: change.kind, error });
    }
  }, 'community-member-broadcast');
}

function deliverToUserRoom(fastify: FastifyInstance, userId: string, emission: CommunityMemberEmission): void {
  switch (emission.event) {
    case SERVER_EVENTS.COMMUNITY_MEMBER_JOINED:
      broadcastToUser(fastify, userId, SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, emission.payload);
      return;
    case SERVER_EVENTS.COMMUNITY_MEMBER_LEFT:
      broadcastToUser(fastify, userId, SERVER_EVENTS.COMMUNITY_MEMBER_LEFT, emission.payload);
      return;
    case SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED:
      broadcastToUser(fastify, userId, SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED, emission.payload);
      return;
  }
}

/** Le branchement des routes : la room personnelle de chaque destinataire, par la porte d'émission typée. */
export function scheduleCommunityMemberBroadcastFrom(fastify: FastifyInstance, change: CommunityMemberChange): void {
  scheduleCommunityMemberBroadcast(
    { prisma: fastify.prisma, deliver: (userId, emission) => deliverToUserRoom(fastify, userId, emission) },
    change,
  );
  if (change.kind === 'joined' && change.via === 'link') {
    deferAfterResponse(
      () => announceCommunityLinkEntry({
        prisma: fastify.prisma,
        relay: linkActivityRelayOf(fastify),
        communityId: change.communityId,
        at: new Date(),
      }),
      'community-link-entry',
    );
  }
}
