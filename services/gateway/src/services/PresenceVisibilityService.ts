import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isGlobalModerator } from '@meeshy/shared/types/role-types';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import { PrivacyPreferencesService } from './PrivacyPreferencesService';

export type PresenceViewer = { readonly userId: string; readonly role: GlobalUserRoleType } | null;
export type PresenceTarget = { readonly id: string; readonly deactivatedAt?: Date | null };
export type ResolvePresenceOptions = { readonly allowConversationContext?: boolean };

const HIDDEN: PresenceVisibility = { showOnline: false, showLastSeenTimestamp: false };
const FULL: PresenceVisibility = { showOnline: true, showLastSeenTimestamp: true };

/**
 * Résout la visibilité de la présence (lastActiveAt/isOnline) d'une cible pour
 * un observateur donné. Orchestration I/O (blocage, amitié, co-participation,
 * préférences) déléguée à la politique pure resolvePresenceVisibility.
 *
 * Seule une amitié acceptée (FriendRequest status=accepted) compte comme
 * "connecté" — une relation d'affiliation/parrainage seule ne suffit plus à
 * révéler isOnline/lastActiveAt à un non-ami.
 *
 * @see docs/superpowers/specs/2026-06-30-profile-last-seen-visibility-design.md
 */
export class PresenceVisibilityService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly privacy: PrivacyPreferencesService,
  ) {}

  async resolveForTarget(
    viewer: PresenceViewer,
    target: PresenceTarget,
    opts?: ResolvePresenceOptions,
  ): Promise<PresenceVisibility> {
    if (target.deactivatedAt) return HIDDEN;

    const isSelf = !!viewer && viewer.userId === target.id;
    if (isSelf || (viewer && isGlobalModerator(viewer.role))) return FULL;
    if (!viewer) return HIDDEN;

    if (await this.isBlockedEitherWay(viewer.userId, target.id)) return HIDDEN;

    const areConnected = await this.areConnected(viewer.userId, target.id);
    const sharesConversation =
      !areConnected && (opts?.allowConversationContext ?? false)
        ? await this.sharesConversation(viewer.userId, target.id)
        : false;
    const prefs = await this.privacy.getPreferences(target.id);

    return resolvePresenceVisibility({
      isSelf: false,
      viewerRole: viewer.role,
      areConnected,
      sharesConversation,
      targetShowOnlineStatus: prefs.showOnlineStatus,
      targetShowLastSeen: prefs.showLastSeen,
      targetIsDeactivated: false,
      isBlockedEitherWay: false,
    });
  }

  /**
   * Version batchée pour les listes (/users/presence, search). Requêtes
   * groupées pour N cibles au lieu de N appels individuels.
   */
  async resolveForTargets(
    viewer: PresenceViewer,
    ids: string[],
    opts?: ResolvePresenceOptions,
  ): Promise<Map<string, PresenceVisibility>> {
    const result = new Map<string, PresenceVisibility>();
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return result;

    if (!viewer) {
      for (const id of uniqueIds) result.set(id, HIDDEN);
      return result;
    }

    const targetRows = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, deactivatedAt: true },
    });
    const deactivated = new Set(
      targetRows.filter((r: { deactivatedAt: Date | null }) => r.deactivatedAt != null).map((r: { id: string }) => r.id),
    );

    // Deactivation is resolved "en amont" of the moderator/self privilege bypass
    // (design §8 + the pure policy's `targetIsDeactivated → HIDDEN` guard, which
    // runs before privilege). resolveForTarget already hides a deactivated target
    // from everyone; the batch list path MUST match it, else a moderator browsing
    // a presence list leaks a deactivated user's online status / last-seen while
    // their single profile view correctly hides it.
    if (isGlobalModerator(viewer.role)) {
      for (const id of uniqueIds) result.set(id, deactivated.has(id) ? HIDDEN : FULL);
      return result;
    }
    const viewerId = viewer.userId;

    const [blockedByTargets, viewerRow] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: uniqueIds }, blockedUserIds: { has: viewerId } },
        select: { id: true },
      }),
      this.prisma.user.findUnique({ where: { id: viewerId }, select: { blockedUserIds: true } }),
    ]);
    const blocked = new Set(blockedByTargets.map((r: { id: string }) => r.id));
    for (const bid of (viewerRow?.blockedUserIds ?? []) as string[]) {
      if (uniqueIds.includes(bid)) blocked.add(bid);
    }

    const friends = await this.prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [
          { senderId: viewerId, receiverId: { in: uniqueIds } },
          { senderId: { in: uniqueIds }, receiverId: viewerId },
        ],
      },
      select: { senderId: true, receiverId: true },
    });
    const connected = new Set<string>();
    for (const f of friends as Array<{ senderId: string; receiverId: string }>) {
      connected.add(f.senderId === viewerId ? f.receiverId : f.senderId);
    }

    let sharesConvo = new Set<string>();
    if (opts?.allowConversationContext) {
      const viewerConversations = await this.prisma.participant.findMany({
        where: { userId: viewerId, isActive: true },
        select: { conversationId: true },
      });
      if (viewerConversations.length > 0) {
        const coParticipants = await this.prisma.participant.findMany({
          where: {
            userId: { in: uniqueIds },
            isActive: true,
            conversationId: { in: viewerConversations.map((c: { conversationId: string }) => c.conversationId) },
          },
          select: { userId: true },
        });
        sharesConvo = new Set(
          coParticipants.map((p: { userId: string | null }) => p.userId).filter((u: string | null): u is string => !!u),
        );
      }
    }

    const prefsMap = await this.privacy.getPreferencesForUsers(
      uniqueIds.map((id) => ({ id, isAnonymous: false })),
    );

    for (const id of uniqueIds) {
      const prefs = prefsMap.get(id);
      result.set(
        id,
        resolvePresenceVisibility({
          isSelf: id === viewerId,
          viewerRole: viewer.role,
          areConnected: connected.has(id),
          sharesConversation: sharesConvo.has(id),
          targetShowOnlineStatus: prefs?.showOnlineStatus ?? true,
          targetShowLastSeen: prefs?.showLastSeen ?? true,
          targetIsDeactivated: deactivated.has(id),
          isBlockedEitherWay: blocked.has(id),
        }),
      );
    }
    return result;
  }

  /**
   * Prefs-only pour les listes où l'accès est déjà garanti par le contexte
   * (co-participants d'une conversation, co-membres d'une communauté) : la
   * présence est montrable, on applique seulement showOnlineStatus/showLastSeen.
   */
  async resolvePrefsOnly(userIds: string[]): Promise<Map<string, PresenceVisibility>> {
    const result = new Map<string, PresenceVisibility>();
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return result;
    const prefsMap = await this.privacy.getPreferencesForUsers(
      uniqueIds.map((id) => ({ id, isAnonymous: false })),
    );
    for (const id of uniqueIds) {
      const p = prefsMap.get(id);
      if (p && !p.showOnlineStatus) result.set(id, HIDDEN);
      else result.set(id, { showOnline: true, showLastSeenTimestamp: p ? p.showLastSeen : true });
    }
    return result;
  }

  private async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: a, blockedUserIds: { has: b } },
          { id: b, blockedUserIds: { has: a } },
        ],
      },
      select: { id: true },
    });
    return !!row;
  }

  private async areConnected(a: string, b: string): Promise<boolean> {
    const friend = await this.prisma.friendRequest.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: a, receiverId: b },
          { senderId: b, receiverId: a },
        ],
      },
      select: { id: true },
    });
    return !!friend;
  }

  private async sharesConversation(a: string, b: string): Promise<boolean> {
    const viewerConversations = await this.prisma.participant.findMany({
      where: { userId: a, isActive: true },
      select: { conversationId: true },
    });
    if (viewerConversations.length === 0) return false;

    const shared = await this.prisma.participant.findFirst({
      where: {
        userId: b,
        isActive: true,
        conversationId: { in: viewerConversations.map((c: { conversationId: string }) => c.conversationId) },
      },
      select: { id: true },
    });
    return !!shared;
  }
}

let singleton: PresenceVisibilityService | null = null;

/**
 * Instance partagée pour les routes (cache de préférences mutualisé entre handlers).
 */
export function getPresenceVisibilityService(prisma: PrismaClient): PresenceVisibilityService {
  if (!singleton) {
    singleton = new PresenceVisibilityService(prisma, new PrivacyPreferencesService(prisma));
  }
  return singleton;
}
