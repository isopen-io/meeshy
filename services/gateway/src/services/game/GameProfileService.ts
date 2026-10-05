/**
 * LES RÉGLAGES DU JEU (#9384 à #9392) — visibilité de la vitrine, du rang, du
 * trésor et de l'Atlas, « Jeu masqué », ordre de la vitrine, opposition à la
 * ligue Amis, drapeau Mythe. Producteur UNIQUE du document `GameProfile` : aucune
 * route n'écrit ces colonnes à côté.
 *
 * ## Ce qu'un lecteur apprend d'un autre compte (conformité D-1 à D-5)
 *
 * Une seule décision, `facetVisibleTo` : le réglage du MEMBRE (jamais celui du
 * lecteur), plafonné par la loi partagée (`capShowcaseVisibility` : « Jeu
 * masqué » ramène à « moi seul », se cacher de la recherche plafonne à « amis »,
 * une valeur inconnue se lit « moi seul »), puis `canViewShowcase` — dans cet
 * ordre, et APRÈS le blocage : deux comptes qui se sont bloqués ne se voient
 * jamais, même sur « tout le monde ». L'amitié est celle de la loi de présence
 * (`amitieAcceptee`), rien d'autre ; ADMIN/BIGBOSS voient (`isGlobalAdmin`).
 *
 * Aucune lecture n'échoue « ouvert » : un réglage illisible se lit « moi seul ».
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GameVisibility } from '@meeshy/shared/types/game';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import {
  ATLAS_DEFAULT_VISIBILITY,
  SHOWCASE_DEFAULT_VISIBILITY,
  SHOWCASE_VISIBILITIES,
  canViewShowcase,
  capShowcaseVisibility,
  sanitizeShowcaseOrder,
  type ShowcaseViewer,
  type ShowcaseVisibility,
} from '@meeshy/shared/utils/game/trophies';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';
import { amitieAcceptee } from '../friendship';
import type { PresenceViewer } from '../PresenceVisibilityService';
import { isBlockedBetween } from '../../utils/blocking';

export type GameFacet = 'showcase' | 'rank' | 'treasury' | 'atlas';

export type GameSettings = {
  readonly visibility: GameVisibility;
  readonly gameHidden: boolean;
  readonly friendsLeagueOptedOut: boolean;
  readonly showcaseOrder: readonly string[];
  readonly mythic: boolean;
};

type StoredProfile = {
  readonly showcaseVisibility?: string | null;
  readonly rankVisibility?: string | null;
  readonly treasuryVisibility?: string | null;
  readonly atlasVisibility?: string | null;
  readonly gameHiddenAt?: Date | null;
  readonly friendsLeagueOptOutAt?: Date | null;
  readonly showcaseOrder?: readonly string[] | null;
  readonly mythicAt?: Date | null;
};

const PROFILE_SELECT = {
  userId: true,
  showcaseVisibility: true,
  rankVisibility: true,
  treasuryVisibility: true,
  atlasVisibility: true,
  gameHiddenAt: true,
  friendsLeagueOptOutAt: true,
  showcaseOrder: true,
  mythicAt: true,
} as const;

/** Les champs stockés de chaque facette, et leur défaut — le SITE UNIQUE de la correspondance. */
const FACETS: Readonly<Record<GameFacet, { readonly column: 'showcaseVisibility' | 'rankVisibility' | 'treasuryVisibility' | 'atlasVisibility'; readonly fallback: ShowcaseVisibility }>> = {
  showcase: { column: 'showcaseVisibility', fallback: SHOWCASE_DEFAULT_VISIBILITY },
  rank: { column: 'rankVisibility', fallback: SHOWCASE_DEFAULT_VISIBILITY },
  treasury: { column: 'treasuryVisibility', fallback: SHOWCASE_DEFAULT_VISIBILITY },
  atlas: { column: 'atlasVisibility', fallback: ATLAS_DEFAULT_VISIBILITY },
};

const isVisibility = (value: unknown): value is ShowcaseVisibility =>
  (SHOWCASE_VISIBILITIES as readonly string[]).includes(value as string);

/** Absent ⇒ le défaut de la facette ; PRÉSENT mais inconnu ⇒ « moi seul » (fail-closed). */
export function storedVisibility(stored: StoredProfile | null | undefined, facet: GameFacet): ShowcaseVisibility {
  const { column, fallback } = FACETS[facet];
  const value = stored?.[column];
  if (value === undefined || value === null) return fallback;
  return isVisibility(value) ? value : 'me';
}

export function settingsOf(stored: StoredProfile | null | undefined): GameSettings {
  return {
    visibility: {
      showcase: storedVisibility(stored, 'showcase'),
      rank: storedVisibility(stored, 'rank'),
      treasury: storedVisibility(stored, 'treasury'),
      atlas: storedVisibility(stored, 'atlas'),
    },
    gameHidden: stored?.gameHiddenAt != null,
    friendsLeagueOptedOut: stored?.friendsLeagueOptOutAt != null,
    showcaseOrder: stored?.showcaseOrder ?? [],
    mythic: stored?.mythicAt != null,
  };
}

export type VisibilityPatch = Partial<Record<GameFacet, ShowcaseVisibility>>;

export class GameProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  async settings(userId: string): Promise<GameSettings> {
    const stored = await this.prisma.gameProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    return settingsOf(stored);
  }

  /** Les réglages de plusieurs comptes, en UNE lecture (absent = défauts). */
  async settingsOfMany(userIds: readonly string[]): Promise<Map<string, GameSettings>> {
    const ids = [...new Set(userIds)];
    const rows = ids.length === 0 ? [] : await this.prisma.gameProfile.findMany({ where: { userId: { in: ids } }, select: PROFILE_SELECT, take: ids.length });
    const byId = new Map(rows.map((row) => [row.userId, row]));
    return new Map(ids.map((id) => [id, settingsOf(byId.get(id))]));
  }

  private async write(userId: string, data: Record<string, unknown>): Promise<void> {
    await this.prisma.gameProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: { id: true } });
  }

  /** Règle ce que montrent la vitrine, le rang, le trésor et l'Atlas. Rend les réglages RÉSULTANTS. */
  async updateVisibility(userId: string, patch: VisibilityPatch): Promise<GameVisibility> {
    const data: Record<string, unknown> = {};
    for (const facet of Object.keys(patch) as GameFacet[]) {
      const value = patch[facet];
      if (value !== undefined && isVisibility(value)) data[FACETS[facet].column] = value;
    }
    if (Object.keys(data).length > 0) await this.write(userId, data);
    return (await this.settings(userId)).visibility;
  }

  /** « Jeu masqué » : le compte sort des classements et des vitrines (conformité A-7, D-2). */
  async setGameHidden(userId: string, hidden: boolean, now: Date = new Date()): Promise<void> {
    await this.write(userId, { gameHiddenAt: hidden ? now : null });
  }

  /** L'opposition à la ligue Amis (conformité B-2) : un interrupteur, à tout moment. */
  async setFriendsLeagueOptOut(userId: string, optedOut: boolean, now: Date = new Date()): Promise<void> {
    await this.write(userId, { friendsLeagueOptOutAt: optedOut ? now : null });
  }

  /** Range les trophées : seules les clés POSSÉDÉES sont gardées, sans doublon. */
  async setShowcaseOrder(userId: string, order: readonly string[], ownedKeys: readonly string[]): Promise<readonly string[]> {
    const kept = sanitizeShowcaseOrder({ order, ownedKeys });
    await this.write(userId, { showcaseOrder: [...kept] });
    return kept;
  }

  async setMythic(userId: string, mythic: boolean, now: Date = new Date()): Promise<void> {
    await this.write(userId, { mythicAt: mythic ? now : null });
  }

  /** Quel lecteur est CE lecteur pour ce membre — ni plus, ni moins que la loi de présence. */
  async viewerKind(viewer: PresenceViewer, targetId: string): Promise<ShowcaseViewer | 'blocked'> {
    if (viewer === null) return 'other';
    if (viewer.userId === targetId) return 'self';
    if (isGlobalAdmin(viewer.role)) return 'admin';
    if (await isBlockedBetween(this.prisma, viewer.userId, targetId)) return 'blocked';
    return (await amitieAcceptee(this.prisma, viewer.userId, targetId)) ? 'friend' : 'other';
  }

  /**
   * Le lecteur a-t-il le droit de voir cette facette du membre ? Le plafond de
   * confidentialité (`hideProfileFromSearch`) est lu à la source ; une lecture
   * qui échoue ferme tout (« moi seul »).
   */
  async facetVisibleTo(params: { readonly viewer: PresenceViewer; readonly targetId: string; readonly facet: GameFacet }): Promise<boolean> {
    const { viewer, targetId, facet } = params;
    const kind = await this.viewerKind(viewer, targetId);
    if (kind === 'blocked') return false;
    if (kind === 'self' || kind === 'admin') return true;

    const settings = await this.settings(targetId);
    const hideProfileFromSearch = await this.hidesFromSearch(targetId);
    const capped = capShowcaseVisibility({
      visibility: settings.visibility[facet],
      hideProfileFromSearch,
      gameHidden: settings.gameHidden,
    });
    return canViewShowcase({ visibility: capped, viewer: kind });
  }

  /** Se cacher de la recherche : illisible ⇒ « caché » (fail-closed). */
  private async hidesFromSearch(userId: string): Promise<boolean> {
    try {
      const stored = (await loadPrivacyPreferencesCached(this.prisma, [userId])).get(userId);
      return stored?.hideProfileFromSearch === true;
    } catch {
      return true;
    }
  }
}
