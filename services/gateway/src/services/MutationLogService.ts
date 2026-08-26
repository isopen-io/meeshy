/**
 * MutationLogService — Wave 1 Task 3.4 (Phase 3 Tier B)
 *
 * Generalises the `Message.clientMessageId` dedup pattern to every
 * non-message write mutation persisted in the iOS outbox (friend
 * request, profile update, block, post like, comment, etc.).
 *
 * Pattern :
 *   1. Client sends a write request with `X-Client-Mutation-Id: cmid_<uuid>`
 *      (validated upstream by `clientMutationId` middleware).
 *   2. Route handler wraps its side-effect in `recordOrReturn(...)`.
 *   3. `recordOrReturn` RÉSERVE la clé `(userId, clientMutationId)` — un
 *      `create` dont l'index unique est l'arbitre — PUIS exécute l'op, PUIS
 *      inscrit le `resultId` sur la ligne réservée.
 *      - Clé déjà conclue (`resultId` présent) → `MutationLogDuplicate`
 *        portant ce `resultId` ; la route relit la ressource et sert la même
 *        réponse qu'au premier appel.
 *      - Clé réservée mais pas conclue, et fraîche → `MutationInFlight` : une
 *        requête jumelle est EN TRAIN de l'appliquer. 409, retentable.
 *      - Clé réservée et ABANDONNÉE (plus vieille que `reservationTtlMs`) →
 *        reprise : l'écrivain précédent a disparu sans conclure.
 *
 * ## Pourquoi la réservation vient AVANT l'op
 *
 * L'ordre historique était lire → op → écrire. Deux requêtes concurrentes
 * portant le MÊME cmid passaient toutes deux la lecture et exécutaient toutes
 * deux `op()` ; l'`upsert` final faisait converger la LIGNE DE JOURNAL, jamais
 * l'effet de bord. Pour un `like` c'était inoffensif (l'ensemble de réactions
 * converge) ; pour un `create` la course produisait un DOUBLON durable — et
 * c'est précisément ce que `OutboxFlusher.staleInflightReclaimSeconds` (iOS)
 * suppose impossible quand il justifie son reclaim à 30 min par « un
 * double-dispatch résiduel est neutralisé par l'idempotence cmid côté
 * gateway ». La fenêtre est la plus large du dépôt sur le repost d'une source
 * éphémère, dont l'op duplique les fichiers média avant d'insérer la ligne.
 *
 * Le contrat « un op qui échoue ne consomme PAS le cmid » est préservé : la
 * réservation est SUPPRIMÉE quand l'op rejette. Et si le processus meurt entre
 * les deux, `reservationTtlMs` la rend reprenable — une réservation orpheline
 * ne peut pas empoisonner un cmid à vie.
 *
 * Why an exception for the duplicate path :
 *   - The op signature is unconstrained (`Promise<T & { id: string }>`)
 *     so we can't return a discriminated `{ kind: 'duplicate', ... }` in
 *     the same return slot without poisoning the caller's type.
 *   - Routes only need to handle the duplicate case occasionally;
 *     try/catch keeps the happy path linear.
 *
 * Cleanup :
 *   See `cron/mutationLogCleanup.ts` (deletes rows older than 30 days
 *   nightly at 03:00).
 *
 * Schema reference : `packages/shared/prisma/schema.prisma → model MutationLog`.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

export interface RecordOrReturnArgs<T> {
  readonly userId: string;
  readonly clientMutationId: string;
  /** Free-form string matching an iOS `OutboxKind` raw value. */
  readonly kind: string;
  /**
   * Side-effect to execute exactly once. MUST resolve with an object
   * carrying an `id` field that uniquely identifies the result so we
   * can refetch it on replay.
   */
  readonly op: () => Promise<T & { id: string }>;
}

/**
 * Thrown by `recordOrReturn` when the `(userId, clientMutationId)` key
 * already exists in the `MutationLog` table. Carries the prior
 * `resultId` so the caller can refetch the resource and return it as
 * if it had just been created.
 *
 * Routes typically pattern-match on this with `instanceof` and emit
 * the same envelope they would for a fresh insert.
 */
export class MutationLogDuplicate extends Error {
  public readonly resultId: string | null;
  public readonly kind: string;

  constructor(resultId: string | null, kind: string) {
    super(
      `Mutation already applied (kind=${kind}, resultId=${resultId ?? 'null'})`
    );
    this.name = 'MutationLogDuplicate';
    this.resultId = resultId;
    this.kind = kind;
  }
}

/**
 * Levée quand le cmid est RÉSERVÉ par une requête jumelle encore en vol.
 *
 * Distincte de {@link MutationLogDuplicate} : il n'y a pas encore de résultat
 * à resservir, et il n'y a rien à rejouer non plus — quelqu'un est en train
 * d'appliquer exactement cette mutation. Le verdict est 409, que la file
 * durable iOS traite déjà comme retentable (409 est délibérément EXCLU de
 * `OutboxFlusher.permanentRejectionStatusCodes`).
 */
export class MutationInFlight extends Error {
  public readonly kind: string;
  public readonly statusCode = 409;

  constructor(kind: string) {
    super(`Mutation already in flight (kind=${kind})`);
    this.name = 'MutationInFlight';
    this.kind = kind;
  }
}

type ReservationRow = {
  readonly resultId: string | null;
  readonly kind: string;
  readonly createdAt?: Date | null;
};

/** Prisma signale une violation d'index unique par le code `P2002`. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export class MutationLogService {
  /**
   * Au-delà de ce délai, une ligne réservée sans `resultId` est tenue pour
   * ABANDONNÉE (processus mort entre la réservation et sa conclusion) et
   * reprenable. Large devant l'op la plus lente du dépôt (duplication de
   * médias d'un repost éphémère), court devant la patience d'une file
   * durable — dont le reclaim est à 30 min.
   */
  public static readonly reservationTtlMs = 2 * 60 * 1000;

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Les TROIS états d'une ligne, et pourquoi il en faut trois.
   *
   * - `concluded` : la mutation a abouti, `resultId` la désigne. C'est le
   *   doublon classique — on resert.
   * - `inFlight`  : réservée, pas conclue, réservation FRAÎCHE. Une jumelle
   *   l'applique en ce moment ; ni resservir ni rejouer.
   * - `abandoned` : réservée, pas conclue, réservation PÉRIMÉE. L'écrivain a
   *   disparu sans conclure — la mutation n'a JAMAIS eu lieu, et la traiter
   *   comme un doublon condamnerait le cmid à vie (une route `diverges`
   *   rendrait 410 pour un geste qui n'est jamais parti).
   *
   * Une ligne sans `createdAt` (forme historique, projection qui ne le
   * demande pas) est tenue pour `concluded` : l'ancien contrat « resultId
   * null ⇒ duplicate » reste le repli, jamais une reprise spéculative.
   */
  private static verdict(row: ReservationRow): 'concluded' | 'inFlight' | 'abandoned' {
    if (row.resultId !== null && row.resultId !== undefined) return 'concluded';
    const createdAt = row.createdAt;
    if (!(createdAt instanceof Date)) return 'concluded';
    return Date.now() - createdAt.getTime() < MutationLogService.reservationTtlMs
      ? 'inFlight'
      : 'abandoned';
  }

  /**
   * Idempotent wrapper around a write side-effect.
   *
   * @throws MutationLogDuplicate when the cmid was already applied.
   * @throws Whatever the wrapped `op` throws on a fresh execution.
   *
   * Note : we do NOT swallow `op` errors — if the underlying mutation
   * fails, we deliberately do NOT persist a `MutationLog` row, so a
   * client retry with the same cmid will re-attempt the operation.
   */
  async recordOrReturn<T>(
    args: RecordOrReturnArgs<T>
  ): Promise<T & { id: string }> {
    const { userId, clientMutationId, kind, op } = args;
    const where = { userId_clientMutationId: { userId, clientMutationId } };
    const select = { resultId: true, kind: true, createdAt: true } as const;

    const existing = await this.prisma.mutationLog.findUnique({ where, select });
    if (existing) {
      const verdict = MutationLogService.verdict(existing);
      if (verdict === 'inFlight') throw new MutationInFlight(existing.kind);
      if (verdict === 'concluded') throw new MutationLogDuplicate(existing.resultId, existing.kind);
      await this.reclaim(where, kind);
    } else {
      // RÉSERVATION. L'index unique `(userId, clientMutationId)` est l'arbitre :
      // de deux requêtes concurrentes, une seule sort d'ici, l'autre part sur le
      // chemin doublon. C'est ce que la lecture seule ne pouvait pas garantir.
      const reserved = await this.reserve({ userId, clientMutationId, kind, where, select });
      if (!reserved) {
        const winner = await this.prisma.mutationLog.findUnique({ where, select });
        if (winner && MutationLogService.verdict(winner) === 'inFlight') throw new MutationInFlight(winner.kind);
        throw new MutationLogDuplicate(winner?.resultId ?? null, winner?.kind ?? kind);
      }
    }

    let result: T & { id: string };
    try {
      result = await op();
    } catch (err) {
      // Un op qui échoue ne consomme PAS le cmid — contrat inchangé. Si cette
      // libération échoue elle aussi, le TTL de réservation la rattrape.
      await this.prisma.mutationLog.delete({ where }).catch(() => undefined);
      throw err;
    }

    await this.prisma.mutationLog.update({ where, data: { kind, resultId: result.id } });

    return result;
  }

  /**
   * Rend `true` si CETTE requête a posé la réservation, `false` si une
   * jumelle l'avait déjà posée. Toute autre erreur remonte.
   */
  private async reserve(args: {
    userId: string;
    clientMutationId: string;
    kind: string;
    where: { userId_clientMutationId: { userId: string; clientMutationId: string } };
    select: { resultId: true; kind: true; createdAt: true };
  }): Promise<boolean> {
    try {
      await this.prisma.mutationLog.create({
        data: {
          userId: args.userId,
          clientMutationId: args.clientMutationId,
          kind: args.kind,
        },
      });
      return true;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Une réservation ABANDONNÉE se reprend : sans cela, un processus mort
      // entre la réservation et sa conclusion empoisonnerait le cmid à vie et
      // la ligne d'outbox correspondante ne pourrait plus jamais aboutir.
      const row = await this.prisma.mutationLog.findUnique({ where: args.where, select: args.select });
      if (row && MutationLogService.verdict(row) === 'abandoned') {
        await this.reclaim(args.where, args.kind);
        return true;
      }
      return false;
    }
  }

  /**
   * Reprend une réservation abandonnée en la re-datant.
   *
   * Fenêtre résiduelle assumée et bornée : deux requêtes qui reprennent la
   * MÊME ligne abandonnée au même instant repartent toutes deux (Prisma n'a
   * pas de `findOneAndUpdate` conditionnel). Le pire cas y est le
   * comportement d'AVANT ce correctif, sur un chemin qui exige déjà qu'un
   * écrivain soit mort en plein vol — pas la course nominale « retry client
   * pendant que la première requête tourne », qui, elle, est fermée par
   * l'index unique.
   */
  private async reclaim(
    where: { userId_clientMutationId: { userId: string; clientMutationId: string } },
    kind: string,
  ): Promise<void> {
    await this.prisma.mutationLog.update({ where, data: { kind, createdAt: new Date() } });
  }
}
