/**
 * LA RÉVISION DE L'ÉTAT DU JEU (#10912) — horloge logique hybride PAR COMPTE, gravée avec l'état.
 *
 * `gameRevision` (#10900) ordonne les trois sources qui servent l'état du jeu à un client (la lecture
 * `GET /me/engagement`, la réponse de frappe, `game:updated`). C'était l'horloge de la passerelle au moment de
 * répondre : juste avec UNE passerelle, faux dès que deux instances aux horloges décalées servent le même compte.
 *
 * La loi, désormais :
 *
 *  - chaque écriture du jeu grave `User.gameRevision = max(maintenant, révision lue + 1)` DANS la même écriture —
 *    la transaction qui écrit l'état, ou la commande atomique qui le fait. La base sérialise : la révision d'un
 *    compte ne recule jamais, quelle que soit l'horloge de la passerelle qui écrit ;
 *  - toute lecture sert la révision GRAVÉE lue AVANT l'état qu'elle sert (toute écriture gravée avant elle y est),
 *    jamais l'heure de la réponse ;
 *  - un compte sans révision gravée sert l'instant, comme avant : la première écriture la grave au moins aussi haut.
 *
 * Rétrocompatible : sur le fil, la même clé, un nombre de millisecondes ; les clients comparent toujours des nombres
 * croissants (`shouldApplyGameState`, `GameReadOrder.isCurrent`).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { rawCommandNumber } from '../engagement/rawCommandNumber';

const log = enhancedLogger.child({ module: 'GameRevision' });

/** La révision suivante : le plus grand de l'instant de la passerelle et de la révision lue + 1. */
export const nextGameRevision = (graved: number | null, now: number): number => Math.max(now, (graved ?? 0) + 1);

/** La révision servie : la gravée, sinon l'instant (compte d'avant #10912). */
export const servedGameRevision = (graved: number | null, now: () => number = Date.now): number => graved ?? now();

/** Une révision lue en base — `long` (BigInt), nombre, ou JSON étendu d'une commande brute. `null` : aucune. */
export function gameRevisionValue(value: unknown): number | null {
  if (typeof value === 'bigint') return Number(value);
  const read = rawCommandNumber(value);
  return read === null ? null : Math.trunc(read);
}

/** La valeur à écrire dans une `update` Prisma (colonne `BigInt?`). */
export const gameRevisionColumn = (revision: number): bigint => BigInt(revision);

/**
 * L'étape `$set` d'une commande par pipeline qui écrit l'état du jeu : la révision y monte dans la MÊME écriture
 * atomique. `$toLong` : la colonne reste un `long`, quel que soit l'encodage du nombre de la passerelle.
 */
export const gameRevisionPipelineSet = (now: number) => ({
  gameRevision: { $max: [{ $toLong: now }, { $add: [{ $toLong: { $ifNull: ['$gameRevision', 0] } }, 1] }] },
});

type RawCommandDb = { $runCommandRaw(command: never): Promise<unknown> };

/**
 * Grave la révision du compte, seule, par une commande atomique — pour un écrivain dont l'écriture est conditionnelle
 * (`updateMany`) et ne peut pas porter `max(…)`. Dans une transaction, elle s'exécute dans sa session. Rend la révision
 * gravée, `null` si le compte n'existe pas.
 */
export async function stampGameRevision(db: RawCommandDb, userId: string, now: number = Date.now()): Promise<number | null> {
  const result = (await db.$runCommandRaw({
    findAndModify: 'User',
    query: { _id: { $oid: userId } },
    update: [{ $set: gameRevisionPipelineSet(now) }],
    new: true,
    fields: { gameRevision: 1 },
  } as never)) as { value?: { gameRevision?: unknown } | null } | null;
  return gameRevisionValue(result?.value?.gameRevision);
}

/**
 * La révision gravée APRÈS une écriture déjà faite (Prestige, Gloire, gel offert, progression de mission). Ne lève
 * jamais : l'écriture du jeu a eu lieu, une révision manquée ne la défait pas — la prochaine écriture la grave.
 */
export async function stampGameRevisionAfterWrite(db: RawCommandDb, userId: string): Promise<void> {
  try {
    await stampGameRevision(db, userId);
  } catch (error) {
    log.warn('game revision not engraved, the next game write engraves it', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** La révision gravée du compte, lue seule — AVANT l'état qu'une lecture va servir. */
export async function gravedGameRevision(db: Pick<PrismaClient, 'user'>, userId: string): Promise<number | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { gameRevision: true } });
  return gameRevisionValue(row?.gameRevision);
}

/** La révision qu'une lecture sert : la gravée, lue avant l'état, sinon l'instant. Une lecture qui tombe sert l'instant. */
export async function gameRevisionToServe(db: Pick<PrismaClient, 'user'>, userId: string): Promise<number> {
  const graved = await gravedGameRevision(db, userId).catch(() => null);
  return servedGameRevision(graved);
}
