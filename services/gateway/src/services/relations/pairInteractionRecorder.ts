/**
 * L'ENREGISTREUR DES INTERACTIONS D'UNE PAIRE (#13932).
 *
 * Chaque site qui écrit une interaction qualifiante (RG-04) — message direct,
 * réaction, vue de post, commentaire, partage, réponse à une story ou un mood,
 * mention, appel, vocal — appelle `notePairInteraction` UNE fois, sans changer son
 * contrat. L'agrégat `PairInteractionDay` répond ensuite à « chacun a-t-il
 * interagi avec l'autre cette semaine ? » sans balayer toute la plateforme.
 *
 * ## Règles
 *
 * - On compte le FAIT, jamais le contenu : la signature ne porte ni texte ni
 *   pièce jointe (E2EE). Un message audio d'une conversation chiffrée se compte par
 *   le `messageType` DÉCLARÉ par le client (D-2) : le compte est déclaratif.
 * - Une ligne par paire NON orientée et par jour UTC, un compteur par sens et par
 *   nature, incrémenté ATOMIQUEMENT (`increment`) ; deux écrivains qui créent la
 *   même ligne se reprennent en incrément (`P2002`), aucun compte n'est perdu.
 * - `notePairInteraction` est FIRE-AND-FORGET : un `emit` n'attend pas les
 *   Promises, un envoi de message n'échoue jamais pour un compteur, et l'échec est
 *   journalisé. Ce n'est jamais le chemin critique.
 * - La ligne expire par index TTL (`expiresAt`) : le job de rattrapage ne purge rien.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationPairKey, relationSideOf } from '@meeshy/shared/types/relation';
import { addUtcDays, utcDayStart } from '@meeshy/shared/utils/iso-week';
import {
  PAIR_INTERACTION_NATURES,
  pairDayColumn,
  type PairInteractionNature,
} from '@meeshy/shared/utils/relation-interactions';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'PairInteractionRecorder' });

/** Douze semaines entières (84 j) plus deux semaines partielles et la semaine courante. */
export const PAIR_INTERACTION_RETENTION_DAYS = 120;

const MAX_ATTEMPTS = 3;

type PairKey = { readonly userLowId: string; readonly userHighId: string; readonly day: Date };

export interface PairInteractionDb {
  readonly pairInteractionDay: {
    update(args: {
      where: { userLowId_userHighId_day: PairKey };
      data: Record<string, { increment: number }>;
    }): PromiseLike<unknown>;
    create(args: { data: PairKey & { expiresAt: Date } & Record<string, unknown> }): PromiseLike<unknown>;
  };
}

export type PairInteractionRecord = {
  readonly actorId: string;
  readonly otherId: string;
  readonly nature: PairInteractionNature;
  readonly at: Date;
};

export type PairInteractionOutcome = 'recorded' | 'ignored';

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

const isKnownNature = (nature: unknown): nature is PairInteractionNature =>
  (PAIR_INTERACTION_NATURES as readonly unknown[]).includes(nature);

export async function recordPairInteraction(
  db: PairInteractionDb,
  record: PairInteractionRecord,
): Promise<PairInteractionOutcome> {
  const { actorId, otherId, nature, at } = record;
  if (!actorId || !otherId || actorId === otherId || !isKnownNature(nature)) return 'ignored';

  const pair = relationPairKey(actorId, otherId);
  const side = relationSideOf(pair, actorId);
  if (!side) return 'ignored';

  const day = utcDayStart(at);
  const key: PairKey = { ...pair, day };
  const column = pairDayColumn(side, nature);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      await db.pairInteractionDay.update({ where: { userLowId_userHighId_day: key }, data: { [column]: { increment: 1 } } });
      return 'recorded';
    } catch (error) {
      if (errorCode(error) !== 'P2025') throw error;
    }
    try {
      await db.pairInteractionDay.create({
        data: { ...key, [column]: 1, expiresAt: addUtcDays(day, PAIR_INTERACTION_RETENTION_DAYS) },
      });
      return 'recorded';
    } catch (error) {
      if (errorCode(error) !== 'P2002') throw error;
    }
  }
  throw new Error('recordPairInteraction: la ligne du jour change sans cesse, abandon après plusieurs reprises');
}

/**
 * Le point d'entrée des sites d'écriture : rien à attendre, rien qui jette.
 * `at` est l'instant du fait (défaut : maintenant).
 */
export function notePairInteraction(
  prisma: PairInteractionDb | PrismaClient,
  record: Omit<PairInteractionRecord, 'at'> & { readonly at?: Date },
): void {
  recordPairInteraction(prisma as PairInteractionDb, { ...record, at: record.at ?? new Date() }).catch((error: unknown) =>
    logger.warn('pair interaction not counted', { nature: record.nature, error }),
  );
}
