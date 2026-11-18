import { unsetOrNull } from '../../utils/prisma-unset';

/**
 * L'ÉCRITURE d'une réintégration, et la seule garde qui la rende sûre.
 *
 * `resolveConversationEntry` refuse un banni — c'est vrai, c'est testé, et ce
 * n'est pas suffisant. Entre la DÉCISION (`outcome: 'rejoin'`, prise sur une
 * lecture) et l'ÉCRITURE qui rallume la ligne, un bannissement peut commettre :
 *
 * | t  | ce qui se passe                                                                 | état de la ligne                     |
 * |----|---------------------------------------------------------------------------------|--------------------------------------|
 * | t1 | une porte lit la ligne : inactive, non bannie ⇒ `outcome: 'rejoin'`              | `isActive: false`                    |
 * | t2 | un modérateur bannit. `resolveBanWrite` lit `isActive: false` ⇒ n'écrit QUE `bannedAt` | `isActive: false`              |
 * | t3 | le bannissement commet                                                           | `isActive: false, bannedAt`          |
 * | t4 | la porte commet `{ ...REJOIN_PARTICIPANT_STATE }` — sans toucher `bannedAt`       | **`isActive: true, bannedAt ≠ null`** |
 *
 * C'est l'état qu'aucune lecture du service ne sait refuser : une ligne ACTIVE
 * et BANNIE est lue comme vivante par toute lecture `userId + isActive: true`
 * (liste des conversations, envoi REST, push, aperçu socket) — l'état exact que
 * #19525, #19604 et #19676 refusent, produit par du code vivant et non hérité.
 *
 * La garde est donc AUSSI dans le `where` de l'écriture : un bannissement tombé
 * dans la fenêtre fait que la ligne ne s'apparie plus, Prisma lève `P2025`, et
 * la porte refuse. C'est la discipline que `restore-for-me.ts` porte depuis
 * #10436/#10443 — **la QUATRIÈME porte de rentrée, la seule à l'avoir reçue** —
 * reprise ici EN ENTIER, `catch` compris : `P2025` ne dit que « plus
 * d'appariement », c'est-à-dire bannie OU disparue, et ces deux causes ne
 * rendent pas le même refus. La relecture les sépare.
 *
 * Pourquoi une unité partagée plutôt que trois copies : les trois portes
 * écrivent la même transition, et une règle qu'il faut retaper à chaque site
 * est une règle qu'un site finira par ne pas avoir — c'est exactement ce qui
 * s'est passé, le commentaire de `restore-for-me` ne documentant que
 * l'exemplaire qu'il touche. Le refus, lui, reste à la porte : chacune a sa
 * forme (403 `BANNED`, un verdict de lot, un `sendForbidden`), et c'est elle
 * qui sait la rendre.
 */
export type RejoinWriteOutcome<TRow> =
  /** La ligne était toujours réintégrable : elle est rallumée. */
  | { readonly outcome: 'rejoined'; readonly participant: TRow }
  /** Un bannissement a commis dans la fenêtre — la relecture le PROUVE. */
  | { readonly outcome: 'banned' }
  /** La ligne ne s'apparie plus et n'est pas bannie : elle a disparu. Fail-closed, aucune recréation silencieuse. */
  | { readonly outcome: 'vanished' };

/**
 * Les deux appels que l'écriture demande, en structural : le double de test
 * reste trivial et l'unité n'importe pas `PrismaClient` — même motif que
 * `ConversationEntryReader`, de l'autre côté de la même décision.
 */
export interface RejoinWriter<TRow> {
  participant: {
    update(args: { where: Record<string, unknown>; data: Record<string, unknown>; include?: Record<string, unknown> }): Promise<TRow>;
    findFirst(args: { where: { id: string }; select: { bannedAt: true } }): Promise<{ bannedAt?: Date | null } | null>;
  };
}

export interface RejoinWriteParams<TRow> {
  readonly prisma: RejoinWriter<TRow>;
  /** La ligne que `resolveConversationEntry` a désignée (`outcome: 'rejoin'`). */
  readonly participantId: string;
  /** Ce que la porte écrit — `REJOIN_PARTICIPANT_STATE` répandu avec ses propres champs. */
  readonly data: Record<string, unknown>;
  /** L'`include` de la porte, quand elle sert la ligne écrite (l'invitation rend son membre). */
  readonly include?: Record<string, unknown>;
}

const isP2025 = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'P2025';

export async function commitParticipantRejoin<TRow>(
  params: RejoinWriteParams<TRow>
): Promise<RejoinWriteOutcome<TRow>> {
  const { prisma, participantId, data, include } = params;

  try {
    const participant = await prisma.participant.update({
      where: { id: participantId, ...unsetOrNull('bannedAt') },
      data,
      ...(include ? { include } : {}),
    });
    return { outcome: 'rejoined', participant };
  } catch (error) {
    if (!isP2025(error)) throw error;
    const current = await prisma.participant.findFirst({
      where: { id: participantId },
      select: { bannedAt: true },
    });
    return current?.bannedAt ? { outcome: 'banned' } : { outcome: 'vanished' };
  }
}
