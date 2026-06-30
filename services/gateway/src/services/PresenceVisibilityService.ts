import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isGlobalModerator } from '@meeshy/shared/types/role-types';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PrivacyPreferencesService } from './PrivacyPreferencesService';

export type PresenceViewer = { readonly userId: string; readonly role: GlobalUserRoleType } | null;
export type PresenceTarget = { readonly id: string; readonly deactivatedAt?: Date | null };
export type ResolvePresenceOptions = { readonly allowConversationContext?: boolean };

const HIDDEN: PresenceVisibility = { showOnline: false, showLastSeenTimestamp: false };
const FULL: PresenceVisibility = { showOnline: true, showLastSeenTimestamp: true };

/**
 * Résout la visibilité de la présence (lastActiveAt/isOnline) d'une cible pour
 * un observateur donné. Orchestration I/O (blocage, amitié, affiliation,
 * co-participation, préférences) déléguée à la politique pure
 * resolvePresenceVisibility.
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
    if (friend) return true;

    const affiliate = await this.prisma.affiliateRelation.findFirst({
      where: {
        status: 'completed',
        OR: [
          { affiliateUserId: a, referredUserId: b },
          { affiliateUserId: b, referredUserId: a },
        ],
      },
      select: { id: true },
    });
    return !!affiliate;
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
