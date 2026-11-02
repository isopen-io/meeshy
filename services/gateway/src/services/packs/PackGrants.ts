/**
 * LES POSSESSIONS SANS ACHAT (#11272) — producteur UNIQUE des lignes
 * `UserPackOwnership` qui ne viennent pas d'une dépense (`PackCatalog.purchase`
 * écrit l'achat, dans la transaction du registre). Un pack se gagne (un rang,
 * un trophée, une saison : `game`), s'octroie (`grant`) ou vient d'un événement
 * (`event`) — décision #11252 : jamais acheté en argent réel.
 *
 * Deux garanties :
 *  - **l'éligibilité est évaluée ICI**, sur des faits que le serveur lit (Gloire,
 *    place de Mythe, trophées gravés, saisons jouées) — jamais sur la parole d'un
 *    client. Seuls les faits que la règle demandée consulte sont lus ;
 *  - **l'écriture est IDEMPOTENTE** par l'unique `(userId, packKey)` : un rejeu, une
 *    course, ou un pack déjà ACHETÉ rendent `already-owned` sans réécrire la
 *    ligne (un achat garde sa source et son prix).
 *
 * La ligne ne porte aucun `requestId` (rien n'a été dépensé) et un prix de 0 :
 * `priceMeeshes` était REQUIS avant #11272, et un serveur d'avant qui relit la
 * ligne après un retour arrière (l'export RGPD la sélectionne) lève sur un champ
 * requis absent. Posséder n'est pas installer — l'installation reste un geste du compte.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { packChoiceKey, type PackDomain } from '@meeshy/shared/types/content-pack';
import {
  isPackEligible,
  packEligibilityReference,
  type PackEligibilityFacts,
  type PackEligibilityRule,
} from '@meeshy/shared/types/pack-ownership';
import { gloryStanding } from '@meeshy/shared/utils/game/glory';
import { NO_PACK_UNLOCK_FACTS, type PackUnlockFacts } from '@meeshy/shared/types/pack-unlock';
import { gloryTotalFromLedger } from '../game/GloryService';
import { MythicSeatService } from '../game/MythicSeatService';

export type PackAward =
  | { readonly source: 'game'; readonly rule: PackEligibilityRule }
  | { readonly source: 'grant' | 'event'; readonly reference: string };

export type PackAwardOutcome = 'granted' | 'already-owned' | 'not-eligible';

export type PackAwardRequest = {
  readonly userId: string;
  readonly pack: { readonly domain: PackDomain; readonly slug: string };
  readonly award: PackAward;
};

export type PackGrantsDeps = { readonly prisma: PrismaClient; readonly now?: () => Date };

const REFERENCE_MAX = 64;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

export class PackGrants {
  private readonly prisma: PrismaClient;
  private readonly now: () => Date;

  constructor(deps: PackGrantsDeps) {
    this.prisma = deps.prisma;
    this.now = deps.now ?? (() => new Date());
  }

  async award({ userId, pack, award }: PackAwardRequest): Promise<PackAwardOutcome> {
    const packKey = packChoiceKey(pack.domain, pack.slug);
    if ((await this.prisma.userPackOwnership.findUnique({ where: { userId_packKey: { userId, packKey } }, select: { id: true } })) !== null) return 'already-owned';
    if (award.source === 'game' && !(await this.eligible(userId, award.rule))) return 'not-eligible';

    const reference = (award.source === 'game' ? packEligibilityReference(award.rule) : award.reference).slice(0, REFERENCE_MAX);
    try {
      await this.prisma.userPackOwnership.create({ data: { userId, packKey, source: award.source, reference, priceMeeshes: 0, acquiredAt: this.now() } });
      return 'granted';
    } catch (error) {
      if (isUniqueViolation(error)) return 'already-owned';
      throw error;
    }
  }

  /**
   * Les faits que des règles consultent, lus UNE fois pour toutes (#11276) — la
   * boutique les montre avant le geste. Sans règle de rang, ni Gloire ni place
   * de Mythe ; sans trophée ni saison, aucune lecture.
   */
  async unlockFacts(userId: string, rules: readonly PackEligibilityRule[]): Promise<PackUnlockFacts> {
    const trophyKeys = [...new Set(rules.flatMap((rule) => (rule.kind === 'trophy' ? [rule.key] : [])))];
    const seasonNumbers = [...new Set(rules.flatMap((rule) => (rule.kind === 'season' ? [rule.number] : [])))];
    const [standing, trophies, seasons] = await Promise.all([
      rules.some((rule) => rule.kind === 'rank') ? this.standingOf(userId) : Promise.resolve(null),
      trophyKeys.length > 0 ? this.prisma.gameTrophy.findMany({ where: { userId, key: { in: trophyKeys } }, select: { key: true } }) : Promise.resolve([]),
      seasonNumbers.length > 0
        ? this.prisma.gameSeason.findMany({ where: { userId, number: { in: seasonNumbers }, stars: { gt: 0 } }, select: { number: true } })
        : Promise.resolve([]),
    ]);
    return {
      ...NO_PACK_UNLOCK_FACTS,
      ...(standing ?? {}),
      trophyKeys: new Set(trophies.map((row) => row.key)),
      seasonNumbers: new Set(seasons.map((row) => row.number)),
    };
  }

  private async standingOf(userId: string): Promise<Pick<PackUnlockFacts, 'rank' | 'glory'>> {
    const [glory, seat] = await Promise.all([gloryTotalFromLedger(this.prisma, userId), new MythicSeatService(this.prisma).seatOf(userId)]);
    return { rank: gloryStanding({ glory, mythicSeat: seat }).rank, glory };
  }

  private async eligible(userId: string, rule: PackEligibilityRule): Promise<boolean> {
    return isPackEligible(rule, await this.factsFor(userId, rule));
  }

  /** Les seuls faits que `rule` consulte ; les autres restent à vide, sans lecture. */
  private async factsFor(userId: string, rule: PackEligibilityRule): Promise<PackEligibilityFacts> {
    const none: PackEligibilityFacts = { rank: 'murmure', trophyKeys: new Set(), seasonNumbers: new Set() };
    switch (rule.kind) {
      case 'rank':
        return { ...none, rank: (await this.standingOf(userId)).rank };
      case 'trophy': {
        const rows = await this.prisma.gameTrophy.findMany({ where: { userId, key: rule.key }, select: { key: true } });
        return { ...none, trophyKeys: new Set(rows.map((row) => row.key)) };
      }
      case 'season': {
        const rows = await this.prisma.gameSeason.findMany({ where: { userId, number: rule.number, stars: { gt: 0 } }, select: { number: true } });
        return { ...none, seasonNumbers: new Set(rows.map((row) => row.number)) };
      }
    }
  }
}
