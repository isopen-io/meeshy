/**
 * LE JEU D'UN AUTRE MEMBRE (#9481) — ce qu'un lecteur apprend du niveau, du rang et
 * du trésor d'un compte, selon SON réglage. La LOI vient de `@meeshy/shared`
 * (`levelFromScore`, `levelCapForRank`, `gloryStanding`, `treasuryTier`, `flameForm`) ; la décision de
 * voir, de `GameProfileService.facetsVisibleTo` — une porte, dans l'ordre : le blocage,
 * soi / ADMIN / ami accepté, le réglage du membre plafonné par « caché de la
 * recherche » et « Jeu masqué ».
 *
 * ## Ce que les AMIS voient de plus (décision porteur 2026-10-06, #9541)
 *
 * La Flamme n'est servie qu'à ses AMIS acceptés (et à soi, et à ADMIN/BIGBOSS) : plus jamais à « tout le
 * monde », même quand le membre a ouvert son rang à tous. Ses POINTS et le NOMBRE de ses trophées ne sont
 * servis qu'à eux aussi ; le nombre de trophées suit en plus le réglage de la VITRINE. Le niveau, les étoiles,
 * le rang et la division (Légende, Mythe) restent ceux du réglage du rang.
 *
 * ## Ce qui ne part JAMAIS (conformité D-1 à D-5, leçon 275)
 *
 * Un PALIER, jamais un compte — sauf les points et le nombre de trophées de la ligne ci-dessus : le niveau
 * et son palier, les étoiles de Prestige, la FORME de la Flamme (jamais ses jours, jamais son bonus), le rang de
 * Gloire et sa division (jamais la Gloire), le palier du trésor (jamais les Meeshes). Aucune date, aucune
 * présence : la Flamme « à risque » d'hier se montre comme celle d'aujourd'hui, et une Flamme éteinte se
 * tait (`flame: null`) sans dire depuis quand.
 *
 * Un refus rend `visible: false` et deux blocs nuls — la MÊME réponse pour un compte qui n'existe
 * pas : ni 403 ni 404, qui diraient que le compte existe. Deux facettes, deux réglages : `standing`
 * (niveau, palier, étoiles, Flamme, rang) suit « rang » ; `treasury` suit « trésor ».
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GameStanding, UserGameProfileResponse } from '@meeshy/shared/types/game';
import { flameForm, flameStatus } from '@meeshy/shared/utils/game/flame';
import { gloryStanding, levelCapForRank } from '@meeshy/shared/utils/game/glory';
import { GAME_PRESTIGE_MAX, legacyLevel, legacyLevelTierKey, levelFromScore, levelTierKey } from '@meeshy/shared/utils/game/levels';
import { treasuryTier } from '@meeshy/shared/utils/game/treasury';
import { meeshTotalsFromLedger } from '../meesh/MeeshService';
import type { PresenceViewer } from '../PresenceVisibilityService';
import { FLAME_USER_SELECT, flameFactsOf } from './FlameService';
import { GameProfileService } from './GameProfileService';
import { gloryTotalFromLedger } from './GloryService';
import { MythicSeatService } from './MythicSeatService';

const CLOSED: UserGameProfileResponse = { visible: false, standing: null, treasury: null };

/** Le membre, un ami accepté ou un administrateur : ceux à qui le jeu se montre de près (#9541). */
const isIntimate = (kind: Awaited<ReturnType<GameProfileService['viewerKind']>>): boolean =>
  kind === 'self' || kind === 'friend' || kind === 'admin';

const STANDING_USER_SELECT = { ...FLAME_USER_SELECT, engagementScore: true, prestige: true } as const;

export class GameStandingService {
  private readonly profile: GameProfileService;

  constructor(
    private readonly prisma: PrismaClient,
    deps: { readonly profile?: GameProfileService } = {},
  ) {
    this.profile = deps.profile ?? new GameProfileService(prisma);
  }

  async standingFor(params: {
    readonly viewer: PresenceViewer;
    readonly targetId: string;
    readonly now?: Date;
  }): Promise<UserGameProfileResponse> {
    const { viewer, targetId } = params;
    const now = params.now ?? new Date();

    const allowed = await this.profile.facetsVisibleTo({ viewer, targetId, facets: ['rank', 'treasury', 'showcase'] });
    const mayStanding = allowed.rank === true;
    const mayTreasury = allowed.treasury === true;
    if (!mayStanding && !mayTreasury) return CLOSED;

    const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: STANDING_USER_SELECT });
    if (user === null) return CLOSED;

    const intimate = mayStanding && isIntimate(await this.profile.viewerKind(viewer, targetId));
    const [standing, treasury] = await Promise.all([
      mayStanding ? this.standing(targetId, user, now, { intimate, trophies: allowed.showcase === true }) : Promise.resolve(null),
      mayTreasury ? this.treasury(targetId) : Promise.resolve(null),
    ]);
    return { visible: true, standing, treasury };
  }

  /**
   * `intimate` : le lecteur est le membre lui-même, un ami accepté ou un administrateur — lui seul reçoit la
   * Flamme et les points. `trophies` : la vitrine est ouverte à ce lecteur — lui seul reçoit le nombre.
   */
  private async standing(
    userId: string,
    user: { readonly engagementScore?: number | null; readonly prestige?: number | null } & Parameters<typeof flameFactsOf>[0],
    now: Date,
    reader: { readonly intimate: boolean; readonly trophies: boolean },
  ): Promise<GameStanding> {
    const [glory, mythicSeat, trophyCount] = await Promise.all([
      gloryTotalFromLedger(this.prisma, userId),
      new MythicSeatService(this.prisma).seatOf(userId),
      reader.intimate && reader.trophies ? this.prisma.gameTrophy.count({ where: { userId } }) : Promise.resolve(null),
    ]);
    const score = Math.max(0, Math.trunc(user.engagementScore ?? 0));
    const rank = gloryStanding({ glory, mythicSeat });
    // Le niveau s'ouvre selon le rang (#9688) ; les champs d'hier gardent l'ancienne loi pour les clients publiés.
    const level = levelFromScore(score, levelCapForRank(rank.rank));
    return {
      level: legacyLevel(level),
      tier: legacyLevelTierKey(level),
      ladder: { level, tier: levelTierKey(level) },
      prestige: Math.min(GAME_PRESTIGE_MAX, Math.max(0, Math.trunc(user.prestige ?? 0))),
      flame: reader.intimate ? shownFlame(user, now) : null,
      rank: rank.rank,
      division: rank.division,
      division5: rank.division5,
      mythic: rank.mythic,
      // Les clés sont ABSENTES, jamais nulles, pour un lecteur qui n'y a pas droit : rien à lire, rien à deviner.
      ...(reader.intimate ? { points: score } : {}),
      ...(trophyCount === null ? {} : { trophyCount }),
    };
  }

  private async treasury(userId: string): Promise<{ readonly tier: GameStandingTreasuryTier }> {
    const totals = await meeshTotalsFromLedger(this.prisma, userId);
    return { tier: treasuryTier(totals.balance).tier };
  }
}

type GameStandingTreasuryTier = ReturnType<typeof treasuryTier>['tier'];

/**
 * La forme que le visiteur voit : celle de la série tant que la Flamme est allumée, à risque ou
 * couverte par un gel — trois états indiscernables dehors. Éteinte, ou sans série : rien.
 */
function shownFlame(row: Parameters<typeof flameFactsOf>[0], now: Date) {
  const facts = flameFactsOf(row, now);
  const status = flameStatus({ lastActiveDay: facts.lastActiveDay, today: facts.today, streak: facts.streak, freezes: facts.freezes });
  return status === 'none' || status === 'out' ? null : flameForm(facts.streak);
}
