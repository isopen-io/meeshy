/**
 * **CE QU'UNE VIOLATION D'UNICITÉ SUR `clientMessageId` VEUT DIRE** (#19960).
 *
 * Extrait de `MessageProcessor.saveMessage`, qui portait le raisonnement en
 * ligne : la question — « est-ce MON rejeu, celui d'un autre, ou une course
 * que personne ne peut réconcilier ? » — ne se réécrit pas dans le corps d'une
 * méthode qui en a dix autres à poser. (Et `MessageProcessor.ts` est en dette
 * de taille : un ajout s'y extrait d'abord.)
 *
 * L'index partiel garde `(conversationId, clientMessageId)` — sans
 * `senderId` — donc `P2002` ne dit PAS « tu as déjà envoyé ça ». Il dit « la
 * clé est prise dans cette conversation ». Les trois suites possibles :
 *
 * | ce que la relecture trouve | ce qu'on rend |
 * |---|---|
 * | MA ligne (le TRIO matche) | un doublon idempotent — le rejeu nominal |
 * | la ligne d'un AUTRE | `ClientMessageIdTakenError` — la clé doit changer |
 * | RIEN | l'erreur d'ORIGINE : course irréconciliable, on n'invente pas |
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { findExistingMessage } from './messageDedupProjection';
import {
  ownReplayWhere,
  ClientMessageIdTakenError,
  clientMessageIdHeldByAnother,
} from './clientMessageIdOwnership';

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

type DedupLogger = {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

/**
 * Relit la ligne que l'appelant REJOUE, ou lève.
 *
 * `findFirst` plutôt que `findUnique` : la contrainte vit dans un index
 * partiel MongoDB posé par la migration manuelle, pas dans un `@@unique`
 * Prisma — le type composé de `findUnique` n'est donc pas généré. Le `@@index`
 * composé déclaré au schéma soutient quand même cette lecture.
 */
export async function resolveOwnReplayAfterUniqueViolation(params: {
  readonly prisma: PrismaClient;
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly senderId: string;
  readonly originalError: unknown;
  readonly corr: Record<string, unknown>;
  readonly logger: DedupLogger;
}) {
  const { prisma, conversationId, clientMessageId, senderId, originalError, corr, logger } = params;

  const existing = await findExistingMessage({
    prisma,
    where: ownReplayWhere({ conversationId, clientMessageId, senderId }),
    conversationId,
    timingLabel: 'messaging.dedupFindFirst',
    corr: corr as Record<string, any>,
  });
  if (existing) return existing;

  // Les deux causes que l'index confond. La seconde lecture ne vit QUE sur ce
  // chemin d'échec — le chemin nominal ne paie rien.
  if (await clientMessageIdHeldByAnother({ prisma, conversationId, clientMessageId })) {
    logger.warn('clientMessageId held by another sender', { conversationId, clientMessageId });
    throw new ClientMessageIdTakenError(conversationId, clientMessageId);
  }

  logger.error('P2002 raised but no existing record found for clientMessageId', {
    conversationId, clientMessageId,
  });
  throw originalError;
}
