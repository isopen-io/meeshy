/**
 * LA RARETÉ DES SUCCÈS (#9390) et LE DRAPEAU MYTHE (#9391, #9390) — l'instantané
 * recalculé chaque nuit. La LOI (bandes de rareté, population minimale,
 * affichage dès 20 titulaires, les 100 Légendes les plus glorieuses) vient de
 * `@meeshy/shared/utils/game/rarity` ; ce service compte et la lui passe.
 *
 *  - **un instantané, jamais une mesure en direct** : `AchievementRarityStat`
 *    porte `(titulaires, population, rareté)` par succès. Aucun parcours de la
 *    collection n'a lieu sur la voie chaude ;
 *  - **les comptes supprimés sortent des deux membres de la fraction**
 *    (conformité G-2) : la population ne compte que les comptes actifs, et les
 *    titulaires retirent ceux des comptes supprimés ;
 *  - **sous 1 000 comptes, aucune rareté** (`measureRarity` rend `null`) : un
 *    pourcentage sur dix personnes n'est pas une rareté ;
 *  - **la Gloire d'un succès est FIGÉE à l'obtention** (`GloryService.creditAchievement`) :
 *    cet instantané ne change JAMAIS ce qui a déjà été payé ;
 *  - **aucune liste globale des Mythes** (conformité A-13) : un drapeau
 *    (`GameProfile.mythicAt`) par compte, que les écrans servent selon la
 *    visibilité du rang du compte.
 *
 * Idempotent : un passage recalcule tout depuis l'état courant, le rejouer ne
 * change rien.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GameAchievementRarities } from '@meeshy/shared/types/game';
import type { AchievementRarity } from '@meeshy/shared/utils/game/glory';
import { ACHIEVEMENT_RARITIES, GLORY_RANKS } from '@meeshy/shared/utils/game/glory';
import { measureRarity, mythicUserIds, rarityShareDisplayable } from '@meeshy/shared/utils/game/rarity';
import { unsetOrNull } from '../../utils/prisma-unset';

const PAGE = 500;

/** Combien de temps la carte servie se garde en mémoire : elle ne change qu'au calcul de nuit. */
export const SERVED_RARITIES_TTL_MS = 5 * 60 * 1000;
/** Le catalogue de succès est borné : jamais plus de lignes que le contrat n'en sert. */
const SERVED_RARITIES_MAX = 1000;

const isRarity = (value: unknown): value is AchievementRarity => (ACHIEVEMENT_RARITIES as readonly string[]).includes(value as string);

export type RarityReading = {
  readonly holders: number;
  readonly population: number;
  readonly rarity: AchievementRarity | null;
  /** La part ne se SERT qu'à partir de 20 titulaires et 1 000 comptes. */
  readonly displayable: boolean;
};

export class AchievementRarityService {
  private served_: { readonly at: number; readonly map: GameAchievementRarities } | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * La carte que le bloc `game` sert (#9489) : `milestoneKey → { rarity, holders, population }`.
   * FAIL-CLOSED : un succès n'y figure que si sa part est AFFICHABLE (20 titulaires et 1 000 comptes,
   * `rarityShareDisplayable`) ET qu'une rareté a été mesurée — sous le seuil l'entrée est ABSENTE, et
   * le client dit « rareté en cours de mesure ». « Mythique » sur deux personnes réidentifierait.
   * Gardée `SERVED_RARITIES_TTL_MS` en mémoire (elle ne bouge qu'au calcul de nuit, qui la renouvelle).
   */
  async served(now: Date = new Date()): Promise<GameAchievementRarities> {
    if (this.served_ !== null && now.getTime() - this.served_.at < SERVED_RARITIES_TTL_MS && now.getTime() >= this.served_.at) {
      return this.served_.map;
    }
    const rows = await this.prisma.achievementRarityStat.findMany({
      select: { milestoneKey: true, holders: true, population: true, rarity: true },
      orderBy: { milestoneKey: 'asc' },
      take: SERVED_RARITIES_MAX,
    });
    const map: GameAchievementRarities = Object.fromEntries(
      rows.flatMap((row) =>
        isRarity(row.rarity) && rarityShareDisplayable({ holders: row.holders, population: row.population })
          ? [[row.milestoneKey, { rarity: row.rarity, holders: row.holders, population: row.population }] as const]
          : [],
      ),
    );
    this.served_ = { at: now.getTime(), map };
    return map;
  }

  /** Recalcule l'instantané de rareté de chaque succès. */
  async recomputeRarity(now: Date = new Date()): Promise<{ readonly population: number; readonly keys: number }> {
    const population = await this.prisma.user.count({ where: { isActive: true, ...unsetOrNull('deletedAt') } });
    const all = await this.prisma.engagementMilestone.groupBy({ by: ['milestoneKey'], where: { milestoneType: 'achievement' }, _count: { _all: true } });
    const fromDeleted = await this.holdersAmongDeletedAccounts();

    for (const group of all) {
      const holders = Math.max(0, group._count._all - (fromDeleted.get(group.milestoneKey) ?? 0));
      const rarity = measureRarity({ holders, population });
      await this.prisma.achievementRarityStat.upsert({
        where: { milestoneKey: group.milestoneKey },
        create: { milestoneKey: group.milestoneKey, holders, population, rarity, measuredAt: now },
        update: { holders, population, rarity, measuredAt: now },
        select: { id: true },
      });
    }
    this.served_ = null;
    return { population, keys: all.length };
  }

  /** Les titulaires qui ne comptent plus : ceux des comptes supprimés, par succès. */
  private async holdersAmongDeletedAccounts(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.user.findMany({
        where: { deletedAt: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE,
      });
      if (page.length === 0) break;
      cursor = page[page.length - 1]!.id;
      const groups = await this.prisma.engagementMilestone.groupBy({
        by: ['milestoneKey'],
        where: { milestoneType: 'achievement', userId: { in: page.map((u) => u.id) } },
        _count: { _all: true },
      });
      for (const group of groups) counts.set(group.milestoneKey, (counts.get(group.milestoneKey) ?? 0) + group._count._all);
      if (page.length < PAGE) break;
    }
    return counts;
  }

  /** La rareté mesurée d'un succès, ou `null` s'il n'a pas encore d'instantané. */
  async reading(milestoneKey: string): Promise<RarityReading | null> {
    const row = await this.prisma.achievementRarityStat.findUnique({
      where: { milestoneKey },
      select: { holders: true, population: true, rarity: true },
    });
    if (row === null) return null;
    return {
      holders: row.holders,
      population: row.population,
      rarity: (row.rarity ?? null) as AchievementRarity | null,
      displayable: rarityShareDisplayable({ holders: row.holders, population: row.population }),
    };
  }

  /**
   * Pose le drapeau Mythe sur les 100 Légendes les plus glorieuses et le retire
   * aux autres. Les comptes supprimés ou inactifs n'y concourent pas.
   */
  async recomputeMythic(now: Date = new Date()): Promise<readonly string[]> {
    const legendStart = GLORY_RANKS.at(-1)!.minGlory;
    const sums = await this.prisma.gloryLedger.groupBy({ by: ['userId'], _sum: { delta: true }, having: { delta: { _sum: { gte: legendStart } } } });
    const ids = sums.map((row) => row.userId);
    const live = new Set(
      ids.length === 0
        ? []
        : (await this.prisma.user.findMany({ where: { id: { in: ids }, isActive: true, ...unsetOrNull('deletedAt') }, select: { id: true }, take: ids.length })).map((u) => u.id),
    );
    const chosen = mythicUserIds(sums.filter((row) => live.has(row.userId)).map((row) => ({ userId: row.userId, glory: row._sum.delta ?? 0 })));

    for (const userId of chosen) {
      await this.prisma.gameProfile.upsert({ where: { userId }, create: { userId, mythicAt: now }, update: { mythicAt: now }, select: { id: true } });
    }
    await this.prisma.gameProfile.updateMany({ where: { mythicAt: { not: null }, userId: { notIn: [...chosen] } }, data: { mythicAt: null } });
    return chosen;
  }
}
