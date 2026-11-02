import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import { PrivacyPreferencesService } from './PrivacyPreferencesService';
import { amisAcceptes, niveauEffectif, niveauxParmi } from './friendship';
import { getBlockedUserIdsAmong, isBlockedBetween } from '../utils/blocking';

export type PresenceViewer = { readonly userId: string; readonly role: GlobalUserRoleType } | null;
export type PresenceTarget = { readonly id: string; readonly deactivatedAt?: Date | null };

const HIDDEN: PresenceVisibility = { showOnline: false, showLastSeenTimestamp: false };
const FULL: PresenceVisibility = { showOnline: true, showLastSeenTimestamp: true };

/**
 * Résout la visibilité de la présence (lastActiveAt/isOnline) d'une cible pour
 * un observateur donné. Orchestration I/O (blocage, amitié, préférences)
 * déléguée à la politique pure resolvePresenceVisibility.
 *
 * Seul un lien d'au moins Ami (niveau effectif, `services/friendship.ts` :
 * ligne UserRelation, ou à défaut FriendRequest status=accepted) compte comme
 * "connecté" — une relation d'affiliation/parrainage seule ne suffit pas à
 * révéler isOnline/lastActiveAt à un non-ami, et depuis le 2026-08-25 le
 * partage d'une conversation n'en est plus une non plus (voir la directive
 * gravée dans `resolvePresenceVisibility` et `services/gateway/decisions.md`).
 * Le bypass suit désormais `isGlobalAdmin` (ADMIN/BIGBOSS) — MODERATOR a
 * perdu son accès privilégié.
 *
 * @see docs/superpowers/specs/2026-06-30-profile-last-seen-visibility-design.md
 */
export class PresenceVisibilityService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly privacy: PrivacyPreferencesService,
  ) {}

  async resolveForTarget(viewer: PresenceViewer, target: PresenceTarget): Promise<PresenceVisibility> {
    if (target.deactivatedAt) return HIDDEN;

    const isSelf = !!viewer && viewer.userId === target.id;
    if (isSelf || (viewer && isGlobalAdmin(viewer.role))) return FULL;
    if (!viewer) return HIDDEN;

    if (await isBlockedBetween(this.prisma, viewer.userId, target.id)) return HIDDEN;

    const relationLevel = await niveauEffectif(this.prisma, viewer.userId, target.id);
    const prefs = await this.privacy.getPreferences(target.id);

    return resolvePresenceVisibility({
      isSelf: false,
      viewerRole: viewer.role,
      relationLevel,
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
  async resolveForTargets(viewer: PresenceViewer, ids: string[]): Promise<Map<string, PresenceVisibility>> {
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

    // Deactivation is resolved "en amont" of the admin/self privilege bypass
    // (design §8 + the pure policy's `targetIsDeactivated → HIDDEN` guard, which
    // runs before privilege). resolveForTarget already hides a deactivated target
    // from everyone; the batch list path MUST match it, else an admin browsing
    // a presence list leaks a deactivated user's online status / last-seen while
    // their single profile view correctly hides it.
    if (isGlobalAdmin(viewer.role)) {
      for (const id of uniqueIds) result.set(id, deactivated.has(id) ? HIDDEN : FULL);
      return result;
    }
    const viewerId = viewer.userId;

    const blocked = await getBlockedUserIdsAmong(this.prisma, viewerId, uniqueIds);

    const levels = await niveauxParmi(this.prisma, viewerId, uniqueIds);

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
          relationLevel: levels.get(id) ?? 'PUBLIC',
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
   * Les `User.id` avec qui `userId` est LIÉ par une amitié acceptée — la seule
   * relation que la directive du 2026-08-25 tient pour une autorisation —
   * MOINS tout pair en relation de blocage, dans un sens ou dans l'autre
   * (#13298) : le blocage ne rompt pas la `FriendRequest` en base, il retire
   * l'audience. Une lecture de blocage EN LOT (`getBlockedUserIdsAmong`),
   * jamais une par ami.
   *
   * Même loi que {@link niveauEffectif} (`amisAcceptes`) : là où celle-ci
   * répond « ces deux-là ? », ici on demande « lesquels ? », parce qu'un ÉVENTAIL de présence
   * (`_broadcastUserStatus`) doit nommer son audience avant de connaître ses
   * membres. Le coût reste borné par le nombre d'amis du sujet — jamais par la
   * population connectée de la passerelle, dont l'énumération avait déjà fait
   * grossir ce chemin avec le serveur plutôt qu'avec la question posée.
   *
   * `blockRelated` : la relation de blocage COMPLÈTE du sujet, quand l'appelant
   * l'a déjà lue (`getBlockRelatedUserIds`) — elle n'est alors pas relue (#13350).
   */
  async acceptedFriendIds(
    userId: string,
    options: { readonly blockRelated?: ReadonlySet<string> } = {},
  ): Promise<Set<string>> {
    const friendIds = await amisAcceptes(this.prisma, userId);
    const blocked = options.blockRelated ?? await getBlockedUserIdsAmong(this.prisma, userId, friendIds);
    return new Set(friendIds.filter((friendId) => !blocked.has(friendId)));
  }

  /**
   * {@link acceptedFriendIds}, avec le NIVEAU effectif de chaque lien : l'éventail
   * de `user:status` doit savoir QUI est Ami (en ligne seulement) et QUI est
   * Proche ou Sang (présence détaillée) avant d'émettre (#13928). Même liste,
   * même retrait du blocage ; une requête de niveaux de plus, bornée par les amis
   * du sujet, jamais par la population connectée. Le niveau ne se lit qu'au site
   * de la loi (`niveauxParmi`) ; ce qu'il autorise se décide dans `presence-audience`,
   * par la loi de présence, jamais par une comparaison de niveaux ici.
   */
  async acceptedFriendLevels(
    userId: string,
    options: { readonly blockRelated?: ReadonlySet<string> } = {},
  ): Promise<ReadonlyMap<string, RelationLevel>> {
    const friendIds = [...await this.acceptedFriendIds(userId, options)];
    const levels = await niveauxParmi(this.prisma, userId, friendIds);
    return new Map(friendIds.map((id) => [id, levels.get(id) ?? 'PUBLIC'] as const));
  }

  /**
   * La porte d'un ÉVÉNEMENT de présence poussé (`presence:snapshot`) —
   * {@link PresenceVisibilityService.resolveForTargets}, plus un cran : un
   * blocage, dans un sens ou dans l'autre, masque la cible même pour
   * ADMIN/BIGBOSS. C'est la règle que `_broadcastUserStatus` applique déjà à
   * TOUTES ses charges par `.except()` : sur un canal de diffusion, la décision
   * de couper le lien l'emporte sur le privilège (#13298). Les lectures REST
   * gardent le privilège administrateur, d'où une méthode distincte.
   */
  async resolveForPresenceEvent(viewer: PresenceViewer, ids: string[]): Promise<Map<string, PresenceVisibility>> {
    const visibility = await this.resolveForTargets(viewer, ids);
    if (!viewer || !isGlobalAdmin(viewer.role)) return visibility;
    const blocked = await getBlockedUserIdsAmong(this.prisma, viewer.userId, [...visibility.keys()]);
    if (blocked.size === 0) return visibility;
    return new Map([...visibility].map(([id, v]) => [id, blocked.has(id) ? HIDDEN : v]));
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
