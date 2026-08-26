/**
 * The conversation-list preview, made to respect the reader's own hiding.
 *
 * The list query selects the last message with a NESTED `take: 1`, which cannot
 * carry a per-conversation filter — Prisma applies one `where` to the whole
 * nested selection, and the cut-off differs from conversation to conversation.
 * So the hiding is settled after the fact, in two steps that cost nothing to
 * the overwhelming majority of readers:
 *
 *   1. the cut-off is read from the `userPreferences` row the list ALREADY
 *      selects (same Mongo document, no extra query);
 *   2. one indexed lookup asks whether any of the ≤ `limit` preview messages
 *      is individually hidden — a single `userId + messageId IN (…)` read,
 *      not a full scan of the user's deletions.
 *
 * Only conversations whose preview turns out to be hidden pay a follow-up
 * query, and each of those is a single indexed read for that conversation's
 * next visible message. A reader who has hidden nothing issues exactly one
 * extra query on the whole list, and it returns nothing.
 *
 * The fallback matters as much as the hiding: after a `delete-for-me` on the
 * last message, the row must show the PREVIOUS message, not go blank. After a
 * `clear-history` it does go blank, because there is nothing left to show —
 * same code path, and the difference falls out of the data rather than out of a
 * special case.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { applyPersonalHistoryHiding, loadPersonalHistoryHiding, NO_PERSONAL_HIDING } from './personalHistoryFilter';
import { applyHistoryFloor } from './historyFloor';

export interface PreviewCandidate {
  readonly conversationId: string;
  /** `null` when the conversation has no message at all. */
  readonly message: { id: string; createdAt: Date } | null;
  /**
   * The reader's `clearHistoryBefore` for THIS conversation. `null` states it
   * is known to be absent; `undefined` says the caller did not select the
   * preferences row, and the cut-offs are then loaded here in one batched read.
   */
  readonly clearHistoryBefore?: Date | null;
}

export interface ResolveVisibleLastMessagesParams {
  readonly userId: string | undefined | null;
  readonly candidates: readonly PreviewCandidate[];
  /**
   * The caller's OWN preview projection, so the replacement row has exactly the
   * shape the list already serialises. Either form is accepted because the two
   * list surfaces disagree: `GET /conversations` projects with `select`, the
   * conversation search with `include`.
   */
  readonly query: { select: Record<string, unknown> } | { include: Record<string, unknown> };
  /**
   * `conversationId` → plancher d'historique du lecteur (`services/historyFloor`).
   * Une conversation absente n'a pas de plancher. À la différence du masquage
   * personnel, il vaut aussi pour un lecteur SANS compte, et il dégrade FERMÉ :
   * une reprise qui échoue sous un plancher rend « aucun aperçu », jamais
   * l'aperçu d'avant l'arrivée.
   */
  readonly historyFloors?: ReadonlyMap<string, Date>;
}

type PreviewWithMessage = PreviewCandidate & { message: { id: string; createdAt: Date } };

/**
 * La sonde du masquage PERSONNEL — deux lectures indexées sur les seuls
 * aperçus de la page — rendue comme un prédicat sur un candidat.
 */
async function probePersonalHiding(
  prisma: PrismaClient,
  userId: string,
  candidates: readonly PreviewWithMessage[],
): Promise<(candidate: PreviewWithMessage) => boolean> {
  const unknownCutoffs = candidates
    .filter((c) => c.clearHistoryBefore === undefined)
    .map((c) => c.conversationId);

  const [deletions, loadedCutoffs] = await Promise.all([
    prisma.userMessageDeletion.findMany({
      where: { userId, messageId: { in: candidates.map((c) => c.message.id) } },
      select: { messageId: true },
    }),
    unknownCutoffs.length === 0
      ? Promise.resolve([] as Array<{ conversationId: string; clearHistoryBefore: Date | null }>)
      : prisma.userConversationPreferences.findMany({
          where: {
            userId,
            conversationId: { in: unknownCutoffs },
            clearHistoryBefore: { not: null },
          },
          select: { conversationId: true, clearHistoryBefore: true },
        }),
  ]);
  const individuallyHidden = new Set(deletions.map((d) => d.messageId));
  const cutoffByConversation = new Map(
    loadedCutoffs.map((row) => [row.conversationId, row.clearHistoryBefore])
  );

  return (c) => {
    if (individuallyHidden.has(c.message.id)) return true;
    const cutoff =
      c.clearHistoryBefore === undefined
        ? cutoffByConversation.get(c.conversationId) ?? null
        : c.clearHistoryBefore;
    return cutoff !== null && c.message.createdAt < cutoff;
  };
}

/**
 * Returns a map `conversationId -> replacement preview`, containing ONLY the
 * conversations whose selected preview is hidden from this reader. A value of
 * `null` means "show no preview at all".
 */
export async function resolveVisibleLastMessages(
  prisma: PrismaClient,
  { userId, candidates, query, historyFloors }: ResolveVisibleLastMessagesParams
): Promise<Map<string, unknown | null>> {
  const replacements = new Map<string, unknown | null>();

  const withMessage = candidates.filter((c): c is PreviewWithMessage => c.message !== null);
  if (withMessage.length === 0) return replacements;

  const floorOf = (c: PreviewWithMessage): Date | null => historyFloors?.get(c.conversationId) ?? null;
  const belowFloor = (c: PreviewWithMessage): boolean => {
    const floor = floorOf(c);
    return floor !== null && c.message.createdAt < floor;
  };

  try {
    // Le masquage personnel n'existe que pour un compte ; le plancher, lui,
    // borne aussi un lecteur sans compte — un anonyme n'a rien à sonder, mais
    // il a un plancher.
    const hiddenPersonally = userId ? await probePersonalHiding(prisma, userId, withMessage) : () => false;
    const hiddenPreviews = withMessage.filter((c) => belowFloor(c) || hiddenPersonally(c));

    if (hiddenPreviews.length === 0) return replacements;

    const resolved = await Promise.all(
      hiddenPreviews.map(async (candidate) => {
        const hiding = userId
          ? await loadPersonalHistoryHiding(prisma, { userId, conversationId: candidate.conversationId })
          : NO_PERSONAL_HIDING;
        const next = await prisma.message.findFirst({
          where: applyPersonalHistoryHiding(
            applyHistoryFloor({ conversationId: candidate.conversationId, deletedAt: null }, floorOf(candidate)),
            hiding
          ),
          orderBy: { createdAt: 'desc' },
          ...query,
        } as never);
        return [candidate.conversationId, next ?? null] as const;
      })
    );

    for (const [conversationId, message] of resolved) replacements.set(conversationId, message);

    return replacements;
  } catch (error) {
    logger.warn('[resolveVisibleLastMessages] failed, serving the unfiltered preview', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Le masquage personnel dégrade en « on sert » ; le plancher est un
    // contrôle d'accès et dégrade en « rien » — sous un plancher, l'aperçu
    // global est précisément ce que le lecteur n'a pas le droit de lire.
    return new Map(withMessage.filter(belowFloor).map((c) => [c.conversationId, null] as const));
  }
}
