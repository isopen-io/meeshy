/**
 * LE PSEUDONYME DE LIGUE (#9384, conformité A-4 et A-5) — producteur UNIQUE de
 * `LeaguePseudonym`.
 *
 *  - **le défaut est TIRÉ, jamais calculé** : `crypto.randomInt` au CSPRNG, puis
 *    `leaguePseudonymFromDraw` (loi partagée). Il est STOCKÉ, unique (la
 *    contrainte porte la forme PLIÉE : « Colibri-0A1B » et « colibri0a1b » sont
 *    le même nom), et RENOUVELÉ à chaque saison : un pseudonyme qui dure
 *    indéfiniment devient un identifiant qu'on suit d'une saison à l'autre. Un
 *    pseudonyme qu'un tiers peut recalculer depuis l'identifiant du compte n'en
 *    est pas un ;
 *  - **un nom CHOISI est fermé par défaut** (`GAME_LEAGUE_CUSTOM_PSEUDONYM=1`
 *    pour l'ouvrir) : tant que le filtre d'injures en sept langues, le bouton
 *    « Signaler », la décision motivée et le recours (DSA art. 16-17, App Store
 *    1.2) ne sont pas prêts, n'ouvrir que le pseudonyme tiré (conformité A-5).
 *    Ouvert, il passe par la forme, les noms réservés, l'identité de la personne
 *    — nom d'utilisateur, prénom, nom, nom d'affichage, partie locale de
 *    l'e-mail, numéro —, puis le filtre d'injures injectable.
 */

import { randomInt } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { checkLeaguePseudonym, leaguePseudonymFromDraw } from '@meeshy/shared/utils/game/league';
import { seasonAt } from '@meeshy/shared/utils/game/season';
import { GameRefusal } from './GameRefusal';
import { dayKeyOf } from './gameClock';

const DRAW_SPACE = 36 ** 4;
const DRAW_ATTEMPTS = 12;

/** La forme PLIÉE qui porte l'unicité : casse, accents et séparateurs tombent. */
export const pseudonymKeyOf = (value: string): string =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[._-]/g, '');

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export type PseudonymDeps = {
  /** Le tirage — un entier du CSPRNG ; remplaçable en test. */
  readonly draw?: () => number;
  /** Les noms choisis sont-ils ouverts ? Défaut : la variable d'environnement. */
  readonly customAllowed?: () => boolean;
  /** Le filtre d'injures (sept langues) — absent, rien n'est filtré, et le nom choisi reste fermé. */
  readonly isOffensive?: (value: string) => boolean;
};

type StoredPseudonym = { readonly pseudonym: string; readonly kind: string; readonly seasonNumber: number | null };

export class LeaguePseudonymService {
  private readonly draw: () => number;

  private readonly customAllowed: () => boolean;

  private readonly isOffensive: (value: string) => boolean;

  constructor(
    private readonly prisma: PrismaClient,
    deps: PseudonymDeps = {},
  ) {
    this.draw = deps.draw ?? (() => randomInt(0, DRAW_SPACE));
    this.customAllowed = deps.customAllowed ?? (() => process.env.GAME_LEAGUE_CUSTOM_PSEUDONYM === '1');
    this.isOffensive = deps.isOffensive ?? (() => false);
  }

  async current(userId: string): Promise<string | null> {
    const row = await this.prisma.leaguePseudonym.findUnique({ where: { userId }, select: { pseudonym: true } });
    return row?.pseudonym ?? null;
  }

  /** Les pseudonymes de plusieurs comptes, en UNE lecture. */
  async of(userIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.leaguePseudonym.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, pseudonym: true },
      take: ids.length,
    });
    return new Map(rows.map((row) => [row.userId, row.pseudonym]));
  }

  /**
   * Le pseudonyme de la saison : celui qui est posé tant que la saison n'a pas
   * changé (ou qu'il est CHOISI), sinon un tirage neuf. Un tirage refusé par
   * l'unicité se retire.
   */
  async ensure(userId: string, now: Date = new Date()): Promise<string> {
    const season = seasonAt(dayKeyOf(now, null));
    const stored = (await this.prisma.leaguePseudonym.findUnique({
      where: { userId },
      select: { pseudonym: true, kind: true, seasonNumber: true },
    })) as StoredPseudonym | null;
    if (stored !== null && (stored.kind === 'chosen' || stored.seasonNumber === season)) return stored.pseudonym;

    for (let attempt = 0; attempt < DRAW_ATTEMPTS; attempt += 1) {
      const draw = this.draw();
      if (!Number.isInteger(draw) || draw < 0) throw new Error('league pseudonym draw is not a whole number');
      const pseudonym = leaguePseudonymFromDraw(draw);
      try {
        await this.prisma.leaguePseudonym.upsert({
          where: { userId },
          create: { userId, pseudonym, pseudonymKey: pseudonymKeyOf(pseudonym), kind: 'drawn', seasonNumber: season },
          update: { pseudonym, pseudonymKey: pseudonymKeyOf(pseudonym), kind: 'drawn', seasonNumber: season },
          select: { id: true },
        });
        return pseudonym;
      } catch (err) {
        if (!isP2002(err)) throw err;
      }
    }
    throw new Error('league pseudonym draw kept colliding');
  }

  /** Choisit son pseudonyme. Fermé par défaut ; refus motivés sinon. */
  async choose(params: { readonly userId: string; readonly value: string }): Promise<string> {
    if (!this.customAllowed()) throw new GameRefusal('LEAGUE_PSEUDONYM_FORBIDDEN', { reason: 'custom-closed' });
    const account = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { username: true, firstName: true, lastName: true, displayName: true, email: true, phoneNumber: true },
    });
    const forbidden = [
      account?.username,
      account?.firstName,
      account?.lastName,
      account?.displayName,
      account?.email?.split('@')[0],
      account?.phoneNumber?.replace(/\D/g, ''),
    ].filter((name): name is string => typeof name === 'string' && name.length > 0);

    const verdict = checkLeaguePseudonym({ value: params.value, forbidden });
    if ('reason' in verdict) {
      throw new GameRefusal(verdict.reason === 'shape' ? 'LEAGUE_PSEUDONYM_INVALID' : 'LEAGUE_PSEUDONYM_FORBIDDEN', { reason: verdict.reason });
    }
    if (this.isOffensive(params.value)) throw new GameRefusal('LEAGUE_PSEUDONYM_FORBIDDEN', { reason: 'offensive' });

    const season = seasonAt(dayKeyOf(new Date(), null));
    try {
      await this.prisma.leaguePseudonym.upsert({
        where: { userId: params.userId },
        create: { userId: params.userId, pseudonym: params.value, pseudonymKey: pseudonymKeyOf(params.value), kind: 'chosen', seasonNumber: season },
        update: { pseudonym: params.value, pseudonymKey: pseudonymKeyOf(params.value), kind: 'chosen', seasonNumber: season },
        select: { id: true },
      });
    } catch (err) {
      if (isP2002(err)) throw new GameRefusal('LEAGUE_PSEUDONYM_TAKEN');
      throw err;
    }
    return params.value;
  }

  /** Retire le pseudonyme (retrait du consentement) : il ne survit pas à la ligue. */
  async release(userId: string): Promise<void> {
    await this.prisma.leaguePseudonym.deleteMany({ where: { userId } });
  }
}
