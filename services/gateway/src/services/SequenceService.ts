import type { PrismaClient } from '@prisma/client';

/**
 * SyncEngine unifié (spec §5, A1) — allocation atomique d'un numéro de séquence
 * monotone PAR utilisateur.
 *
 * `nextSeq(userId)` fait un upsert `increment` sur `UserEventSeq` : sur un
 * document existant il incrémente `lastSeq` de 1 et retourne la nouvelle valeur,
 * sinon il crée la ligne à `lastSeq = 1`. L'upsert MongoDB (findOneAndUpdate
 * avec `upsert`) est atomique au niveau document — deux appels concurrents pour
 * le même user renvoient donc deux valeurs distinctes et strictement
 * croissantes, jamais un doublon.
 *
 * Retourne un `number` (les `_seq` restent très en deçà de `Number.MAX_SAFE_INTEGER`
 * en pratique ; le stockage est `BigInt` côté Prisma pour la marge). Dead-but-ready
 * en A1 : câblé par `emitWithSeq` en A2.
 */
export class SequenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async nextSeq(userId: string): Promise<number> {
    const row = await this.prisma.userEventSeq.upsert({
      where: { userId },
      create: { userId, lastSeq: BigInt(1) },
      update: { lastSeq: { increment: BigInt(1) } },
      select: { lastSeq: true },
    });
    return Number(row.lastSeq);
  }

  /**
   * Lit le dernier `lastSeq` sans l'incrémenter (0 si l'utilisateur n'a jamais
   * émis d'event). Utilisé par l'endpoint `/sync` (A3) pour calculer `hasGap`.
   */
  async currentSeq(userId: string): Promise<number> {
    const row = await this.prisma.userEventSeq.findUnique({
      where: { userId },
      select: { lastSeq: true },
    });
    return row ? Number(row.lastSeq) : 0;
  }
}
