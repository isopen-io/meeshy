/**
 * LES DÉPENSES DE MEESHES (#9376) — producteur unique des lignes `spend`.
 *
 * Gel de Flamme, rallumage, changement de mission : chacune est UNE ligne
 * négative du registre `MeeshLedger` existant, écrite avec son effet dans une
 * seule transaction. Même loi que la frappe :
 *
 *  - **idempotente** — `(userId, requestId)` est unique. Rejouer rend la
 *    première dépense (`already-spent`), jamais une seconde ; un `requestId`
 *    déjà porté par une AUTRE écriture du registre (autre type de dépense,
 *    frappe, octroi) est refusé (`REQUEST_ID_CONFLICT`), sans effet ;
 *  - **lue au registre** — le solde est `Σ(delta)`, jamais la colonne
 *    `meeshBalance`, qui n'est qu'une projection (#6428) ;
 *  - **atomique** — la ligne et l'effet (`apply`) s'écrivent ensemble ou pas
 *    du tout. Une dépense sans effet, ou un effet sans dépense, est impossible.
 *
 * Les REFUS métier (déjà au maximum, fenêtre close…) sont décidés par
 * l'appelant, qui les relit dans `apply` : lever dans `apply` annule tout.
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { withRetry } from '../MessageMediaConsumptionService';
import { meeshTotalsFromLedger } from '../meesh/MeeshService';
import { GameRefusal } from './GameRefusal';

export type SpendKind = 'flame-freeze' | 'flame-relight' | 'mission-reroll';

/** La transaction que `apply` reçoit : le client Prisme interactif. */
export type SpendTx = Prisma.TransactionClient;

export type SpendRequest<T> = {
  readonly userId: string;
  readonly requestId: string;
  readonly price: number;
  readonly kind: SpendKind;
  readonly meta?: Prisma.InputJsonObject;
  /**
   * Les REFUS de l'état du compte, évalués avant le solde (un refus motivé
   * vaut mieux qu'un « solde insuffisant » qui le masque) et APRÈS la
   * détection du rejeu : une requête rejouée ne se voit jamais refuser ce
   * qu'elle a déjà obtenu. Lecture seule.
   */
  readonly guard?: () => Promise<void>;
  /** L'effet de la dépense, écrit dans la MÊME transaction. */
  readonly apply?: (tx: SpendTx) => Promise<T>;
};

export type SpendOutcome<T> =
  | { readonly status: 'spent'; readonly balance: number; readonly result: T | undefined }
  | { readonly status: 'already-spent'; readonly balance: number; readonly meta: unknown }
  | { readonly status: 'insufficient'; readonly balance: number };

type LedgerLine = { readonly reason: string; readonly meta: unknown };

const LEDGER_LINE_SELECT = { id: true, reason: true, meta: true } as const;

/** La ligne déjà écrite sous ce `requestId` est-elle CETTE dépense ? */
const isSameSpend = (line: LedgerLine, kind: SpendKind): boolean =>
  line.reason === 'spend' &&
  typeof line.meta === 'object' &&
  line.meta !== null &&
  (line.meta as { kind?: unknown }).kind === kind;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export class MeeshSpend {
  constructor(private readonly prisma: PrismaClient) {}

  /** Le solde du registre — jamais la colonne. */
  async balance(userId: string): Promise<number> {
    return (await meeshTotalsFromLedger(this.prisma, userId)).balance;
  }

  async spend<T = undefined>(request: SpendRequest<T>): Promise<SpendOutcome<T>> {
    return withRetry(() => this.spendOnce(request));
  }

  /** Le rejeu rend la PREMIÈRE dépense — à condition que ce soit la même. */
  private async replay<T>(request: SpendRequest<T>, line: LedgerLine | null): Promise<SpendOutcome<T>> {
    if (line !== null && !isSameSpend(line, request.kind)) throw new GameRefusal('REQUEST_ID_CONFLICT', { kind: request.kind });
    return { status: 'already-spent', balance: await this.balance(request.userId), meta: line?.meta ?? null };
  }

  private async spendOnce<T>(request: SpendRequest<T>): Promise<SpendOutcome<T>> {
    const { userId, requestId, price, kind } = request;
    const existing = await this.prisma.meeshLedger.findUnique({
      where: { userId_requestId: { userId, requestId } },
      select: LEDGER_LINE_SELECT,
    });
    if (existing) return this.replay(request, existing);
    await request.guard?.();

    try {
      return await this.prisma.$transaction(async (tx): Promise<SpendOutcome<T>> => {
        const avant = await meeshTotalsFromLedger(tx, userId);
        if (avant.balance < price) return { status: 'insufficient', balance: avant.balance };

        const result = request.apply ? await request.apply(tx) : undefined;
        await tx.meeshLedger.create({
          data: {
            userId,
            delta: -price,
            reason: 'spend',
            requestId,
            meta: { kind, price, ...(request.meta ?? {}) },
          },
        });
        const apres = await meeshTotalsFromLedger(tx, userId);
        await tx.user.update({
          where: { id: userId },
          data: { meeshBalance: apres.balance, meeshMintedLifetime: apres.mintedLifetime },
        });
        return { status: 'spent', balance: apres.balance, result };
      });
    } catch (err) {
      // Deux requêtes de même identifiant : l'index unique a tranché, la
      // première a gagné — on rend SON résultat plutôt qu'une erreur.
      if (isP2002(err)) {
        const first = await this.prisma.meeshLedger.findUnique({
          where: { userId_requestId: { userId, requestId } },
          select: LEDGER_LINE_SELECT,
        });
        return this.replay(request, first);
      }
      throw err;
    }
  }
}
