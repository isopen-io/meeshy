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
 * (`niveauEffectif`, lue par la LOI des cercles `resolveRelationAccess`, #13930) ; ADMIN/BIGBOSS voient (`isGlobalAdmin`).
 *
 * ## Le jeu suit le cercle (RG-25, RG-28)
 *
 * Visibilité servie = minimum(réglage du jeu, droits du cercle). Le lecteur est classé par la loi : `game.basic`
 * (Ami) fait de lui un « friend » — niveau, titres, rang — et `game.sparksGlory` (Proche) lui ouvre en plus les
 * étincelles et la gloire. Sous Ami, il n'est qu'un lecteur public. Le réglage (`friends`, `me`) ne peut donc jamais
 * ouvrir plus que le cercle : il ne fait que restreindre ce que la loi accorde.
 *
 * Aucune lecture n'échoue « ouvert » : un réglage illisible se lit « moi seul ». Un identifiant
 * malformé, un compte supprimé ou désactivé se lisent comme un compte inconnu — ADMIN compris —
 * et jamais une erreur qui distinguerait les cas.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GameVisibility } from '@meeshy/shared/types/game';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
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
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import type { RelationFeature } from '@meeshy/shared/utils/relation-levels';
import { niveauEffectif } from '../friendship';
import type { PresenceViewer } from '../PresenceVisibilityService';
import { isBlockedBetween } from '../../utils/blocking';

export type GameFacet = 'showcase' | 'rank' | 'treasury' | 'atlas';

export type GameSettings = {
  readonly visibility: GameVisibility;
  readonly gameHidden: boolean;
  readonly friendsLeagueOptedOut: boolean;
  readonly showcaseOrder: readonly string[];
};

type StoredProfile = {
  readonly showcaseVisibility?: string | null;
  readonly rankVisibility?: string | null;
  readonly treasuryVisibility?: string | null;
  readonly atlasVisibility?: string | null;
  readonly gameHiddenAt?: Date | null;
  readonly friendsLeagueOptOutAt?: Date | null;
  readonly showcaseOrder?: readonly string[] | null;
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
  };
}

/** Ce que le cercle ouvre à un lecteur : sa classe pour les réglages, et si les étincelles et la gloire en font partie. */
export type GameReach = { readonly kind: ShowcaseViewer | 'blocked'; readonly sparksGlory: boolean };

const PUBLIC_REACH: GameReach = { kind: 'other', sparksGlory: false };
/** Un identifiant malformé se lit comme un compte inconnu : fermé, sans toucher la base. */
const CLOSED_REACH: GameReach = { kind: 'blocked', sparksGlory: false };

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

  /**
   * Quel lecteur est CE lecteur pour ce membre : la loi des cercles, rien d'autre. `kind` classe pour les réglages
   * (`friends` s'ouvre à Ami+) ; `sparksGlory` dit si le cercle ouvre aussi les étincelles et la gloire (Proche+).
   * Soi et ADMIN/BIGBOSS voient tout ; le blocage ferme ; l'anonyme est le public.
   */
  async viewerReach(viewer: PresenceViewer, targetId: string): Promise<GameReach> {
    if (!isValidObjectId(targetId)) return CLOSED_REACH;
    if (viewer === null) return PUBLIC_REACH;
    if (viewer.userId === targetId) return { kind: 'self', sparksGlory: true };
    if (isGlobalAdmin(viewer.role)) return { kind: 'admin', sparksGlory: true };
    if (await isBlockedBetween(this.prisma, viewer.userId, targetId)) return { kind: 'blocked', sparksGlory: false };
    const level = await niveauEffectif(this.prisma, viewer.userId, targetId);
    const opens = (feature: RelationFeature): boolean =>
      resolveRelationAccess({
        viewerId: viewer.userId,
        targetId,
        grantedByViewer: level,
        grantedByTarget: level,
        sharesCommunity: false,
        blockedEitherWay: false,
        viewerMinor: 'unknown',
        targetMinor: 'unknown',
        viewerRole: viewer.role,
        feature,
      }).allowed;
    return { kind: opens('game.basic') ? 'friend' : 'other', sparksGlory: opens('game.sparksGlory') };
  }

  /**
   * Le lecteur a-t-il le droit de voir cette facette du membre ? Le plafond de
   * confidentialité (`hideProfileFromSearch`) est lu à la source ; une lecture
   * qui échoue ferme tout (« moi seul »).
   */
  async facetVisibleTo(params: { readonly viewer: PresenceViewer; readonly targetId: string; readonly facet: GameFacet }): Promise<boolean> {
    const { viewer, targetId, facet } = params;
    return (await this.facetsVisibleTo({ viewer, targetId, facets: [facet] }))[facet] === true;
  }

  /**
   * Plusieurs facettes d'un même membre, décidées d'UNE traversée : le blocage, le lecteur, les réglages
   * et le plafond de recherche se lisent une fois. Mêmes lois, mêmes refus que `facetVisibleTo` — qui en
   * est la projection à une facette. Une facette non demandée est absente de la carte.
   */
  async facetsVisibleTo(params: {
    readonly viewer: PresenceViewer;
    readonly targetId: string;
    readonly facets: readonly GameFacet[];
    /** Le cercle déjà lu par l'appelant : évite une seconde traversée du blocage et du niveau. */
    readonly reach?: GameReach;
  }): Promise<Readonly<Partial<Record<GameFacet, boolean>>>> {
    const { viewer, targetId, facets } = params;
    const verdict = (allowed: boolean): Partial<Record<GameFacet, boolean>> => Object.fromEntries(facets.map((facet) => [facet, allowed]));
    if (!isValidObjectId(targetId)) return verdict(false);
    const { kind } = params.reach ?? (await this.viewerReach(viewer, targetId));
    if (kind === 'blocked') return verdict(false);
    if (kind === 'self') return verdict(true);

    // Un compte supprimé ou désactivé se lit comme un compte inconnu, ADMIN compris ; les trois lectures
    // partent ensemble pour qu'un compte absent ne réponde pas plus vite qu'un refus.
    const [living, settings, hideProfileFromSearch] = await Promise.all([this.isLiving(targetId), this.settings(targetId), this.hidesFromSearch(targetId)]);
    if (!living) return verdict(false);
    if (kind === 'admin') return verdict(true);
    return Object.fromEntries(
      facets.map((facet) => [
        facet,
        canViewShowcase({
          visibility: capShowcaseVisibility({ visibility: settings.visibility[facet], hideProfileFromSearch, gameHidden: settings.gameHidden }),
          viewer: kind,
        }),
      ]),
    );
  }

  private async isLiving(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findFirst({ where: { id: userId }, select: { isActive: true, deletedAt: true } });
    return row !== null && row.isActive !== false && row.deletedAt == null;
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
