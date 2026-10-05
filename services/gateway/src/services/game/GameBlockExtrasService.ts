/**
 * LES SEPT EXTENSIONS DU BLOC `game` (#9384 à #9392) — servies À CÔTÉ de l'existant,
 * jamais à sa place : un ancien client ignore les clés qu'il ne connaît pas, et
 * le schéma partagé fait tomber seule une extension qu'il ne sait pas lire.
 *
 * La passerelle sait ce qu'elle PERSISTE ; tout le reste se déduit par
 * `buildGameBlockExtras` (`@meeshy/shared/utils/game/game-block-extras`), écrit
 * une fois. Ce service rassemble les FAITS — consentement, groupe de la semaine
 * (les autres sur l'instantané, soi en direct), amis, duo, saison, trophées,
 * Atlas, réglages — et les lui passe : c'est la recomposition par site qui fait
 * diverger les clients.
 *
 * Lecture SEULE du point de vue du jeu : aucun crédit, aucun placement. Les
 * lectures partent en parallèle ; une qui échoue fait partir le bloc sans ses
 * extensions (journalisé), jamais à moitié rempli.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { buildGameBlockExtras, type GameBlockExtras, type GameBlockExtrasFacts } from '@meeshy/shared/utils/game/game-block-extras';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { AtlasService } from './AtlasService';
import { DuoService } from './DuoService';
import { GameProfileService } from './GameProfileService';
import { LeagueService } from './LeagueService';
import { READ_ONLY_CREDIT } from './MissionService';
import { SeasonService } from './SeasonService';
import { TrophyService } from './TrophyService';
import { dayKeyOf, minuteOfDayInTimezone } from './gameClock';

const log = enhancedLogger.child({ module: 'GameBlockExtrasService' });

export type ExtrasBase = {
  readonly userId: string;
  readonly score: number;
  readonly levelRecord: number | null;
  readonly prestige: number;
  readonly flameDays: number;
  readonly balance: number;
  readonly timezone: string | null;
  readonly now?: Date;
};

export type GameBlockExtrasDeps = {
  readonly league?: LeagueService;
  readonly duo?: DuoService;
  readonly seasons?: SeasonService;
  readonly trophies?: TrophyService;
  readonly atlas?: AtlasService;
  readonly profile?: GameProfileService;
};

export class GameBlockExtrasService {
  private readonly league: LeagueService;

  private readonly duo: DuoService;

  private readonly seasons: SeasonService;

  private readonly trophies: TrophyService;

  private readonly atlas: AtlasService;

  private readonly profile: GameProfileService;

  constructor(prisma: PrismaClient, deps: GameBlockExtrasDeps = {}) {
    this.profile = deps.profile ?? new GameProfileService(prisma);
    this.league = deps.league ?? new LeagueService(prisma, { profile: this.profile });
    this.seasons =
      deps.seasons ?? new SeasonService(prisma, { creditPoints: READ_ONLY_CREDIT, grantFreeze: async () => undefined });
    this.duo = deps.duo ?? new DuoService(prisma, { creditPoints: READ_ONLY_CREDIT });
    this.trophies = deps.trophies ?? new TrophyService(prisma, { profile: this.profile });
    this.atlas = deps.atlas ?? new AtlasService(prisma);
  }

  /** Les extensions, ou `null` quand une lecture a échoué : le bloc part sans elles. */
  async build(base: ExtrasBase): Promise<GameBlockExtras | null> {
    const now = base.now ?? new Date();
    try {
      const [placement, friends, pseudonym, duo, season, trophies, atlas, settings] = await Promise.all([
        this.league.placement(base.userId, now),
        this.league.friendsFacts(base.userId, now),
        this.league.pseudonyms.current(base.userId),
        this.duo.current(base.userId, now),
        this.seasons.state(base.userId, now),
        this.trophies.list(base.userId),
        this.atlas.state(base.userId),
        this.profile.settings(base.userId),
      ]);

      const facts: GameBlockExtrasFacts = {
        userId: base.userId,
        today: dayKeyOf(now, base.timezone),
        minuteOfDay: minuteOfDayInTimezone(now, base.timezone),
        score: base.score,
        levelRecord: base.levelRecord,
        prestige: base.prestige,
        flameDays: base.flameDays,
        balance: base.balance,
        adultVerified: placement.adultVerified,
        league: {
          consented: placement.consented,
          pseudonym,
          group:
            placement.group === null
              ? null
              : { league: placement.group.league, groupId: placement.group.groupId, members: placement.group.members },
          friendIds: friends.friendIds,
          friendsWeekPoints: friends.weekPoints,
        },
        duo,
        season: { stars: season.stars, claimedSteps: season.claimedSteps, sealOwned: season.sealOwned },
        trophies,
        showcaseOrder: settings.showcaseOrder,
        atlas,
        visibility: settings.visibility,
      };
      return buildGameBlockExtras(facts);
    } catch (error) {
      log.warn('game block extensions unavailable, block served without them', {
        userId: base.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
