/**
 * LE JEU D'UN AUTRE MEMBRE (#9481) — ce qu'un lecteur apprend du niveau, du rang et
 * du trésor d'un compte, selon SON réglage. La LOI vient de `@meeshy/shared`
 * (`levelFromScore`, `gloryStanding`, `treasuryTier`, `flameForm`) ; la décision de
 * voir, de `GameProfileService.facetsVisibleTo` — une porte, dans l'ordre : le blocage,
 * soi / ADMIN / ami accepté, le réglage du membre plafonné par « caché de la
 * recherche » et « Jeu masqué ».
 *
 * ## Ce qui ne part JAMAIS (conformité D-1 à D-5, leçon 275)
 *
 * Un PALIER, jamais un compte : le niveau et son palier, les étoiles de Prestige, la FORME de
 * la Flamme (jamais ses jours, jamais son bonus), le rang de Gloire et sa division (jamais la
 * Gloire), le palier du trésor (jamais les Meeshes). Aucune date, aucune présence : la Flamme
 * « à risque » d'hier se montre comme celle d'aujourd'hui, et une Flamme éteinte se tait
 * (`flame: null`) sans dire depuis quand.
 *
 * Un refus rend `visible: false` et deux blocs nuls — la MÊME réponse pour un compte qui n'existe
 * pas : ni 403 ni 404, qui diraient que le compte existe. Deux facettes, deux réglages : `standing`
 * (niveau, palier, étoiles, Flamme, rang) suit « rang » ; `treasury` suit « trésor ».
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GameStanding, UserGameProfileResponse } from '@meeshy/shared/types/game';
import { flameForm, flameStatus } from '@meeshy/shared/utils/game/flame';
import { gloryStanding } from '@meeshy/shared/utils/game/glory';
import { GAME_PRESTIGE_MAX, levelFromScore, levelTierKey } from '@meeshy/shared/utils/game/levels';
import { treasuryTier } from '@meeshy/shared/utils/game/treasury';
import { meeshTotalsFromLedger } from '../meesh/MeeshService';
import type { PresenceViewer } from '../PresenceVisibilityService';
import { FLAME_USER_SELECT, flameFactsOf } from './FlameService';
import { GameProfileService } from './GameProfileService';
import { gloryTotalFromLedger } from './GloryService';

const CLOSED: UserGameProfileResponse = { visible: false, standing: null, treasury: null };

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

    const allowed = await this.profile.facetsVisibleTo({ viewer, targetId, facets: ['rank', 'treasury'] });
    const mayStanding = allowed.rank === true;
    const mayTreasury = allowed.treasury === true;
    if (!mayStanding && !mayTreasury) return CLOSED;

    const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: STANDING_USER_SELECT });
    if (user === null) return CLOSED;

    const [standing, treasury] = await Promise.all([
      mayStanding ? this.standing(targetId, user, now) : Promise.resolve(null),
      mayTreasury ? this.treasury(targetId) : Promise.resolve(null),
    ]);
    return { visible: true, standing, treasury };
  }

  private async standing(
    userId: string,
    user: { readonly engagementScore?: number | null; readonly prestige?: number | null } & Parameters<typeof flameFactsOf>[0],
    now: Date,
  ): Promise<GameStanding> {
    const [glory, settings] = await Promise.all([gloryTotalFromLedger(this.prisma, userId), this.profile.settings(userId)]);
    const level = levelFromScore(user.engagementScore ?? 0);
    const rank = gloryStanding({ glory, mythic: settings.mythic });
    return {
      level,
      tier: levelTierKey(level),
      prestige: Math.min(GAME_PRESTIGE_MAX, Math.max(0, Math.trunc(user.prestige ?? 0))),
      flame: shownFlame(user, now),
      rank: rank.rank,
      division: rank.division,
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
