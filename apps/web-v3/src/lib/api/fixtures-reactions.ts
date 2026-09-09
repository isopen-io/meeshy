import { isReactionAllowed, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import type { ReactionData } from '@meeshy/shared/types/reaction';

import { VIEWER_ID } from './fixtures-base';
import type { ApiResult } from './http';

/**
 * LE BOUCHON DE `POST/DELETE /api/v1/reactions` (#5814, § 3 conséquence 3) —
 * MIME `services/gateway/src/routes/reactions.ts` ligne à ligne : 201
 * (créée) / 200 (`addResult.unchanged`, `:181-187` — déjà posée) / 409
 * (plafond, `isReactionAllowed`, `:235-241`) pour l'ajout ; 200 / 404
 * (absente) pour le retrait. `isReactionAllowed` est celle de
 * `@meeshy/shared/utils/reaction-limit.ts` — JAMAIS réécrite ici.
 *
 * `mine` mémorise, PAR MESSAGE, les emojis que CE POC (le viewer fixture) a
 * posés — la même portée que `reactionStore` (une session), mais côté
 * SERVEUR simulé : c'est ce qui permet à un test de rejouer « déjà posée ⇒
 * 200 unchanged » sans dépendre de l'état du magasin client.
 *
 * `mine` vit pour la durée du PROCESSUS `bun test` — même discipline que
 * `consumedViewOnceIds`/`sentMessages` (`fixtures.ts`) : `resetFixture
 * ReactionsForTests` évite qu'un fichier dépende de l'ordre d'exécution.
 */
const mine = new Map<string, Set<string>>();
let counter = 0;

export function resetFixtureReactionsForTests(): void {
  mine.clear();
  counter = 0;
}

function reactionDataOf(messageId: string, emoji: string): ReactionData {
  counter += 1;
  const now = new Date();
  return { id: `fx-reaction-${counter}`, messageId, participantId: VIEWER_ID, emoji, createdAt: now, updatedAt: now };
}

/** Miroir `reactions.ts:132-270` (`POST /api/v1/reactions`). */
export function fixtureAddReaction(params: {
  readonly messageId: string;
  readonly emoji: string;
}): ApiResult<ReactionData> {
  const { messageId, emoji } = params;
  const existing = mine.get(messageId) ?? new Set<string>();

  if (existing.has(emoji)) {
    // Déjà posée par ce viewer (simule une session PRÉCÉDENTE) — la
    // passerelle rend 200, sans diffusion (`:181-187`).
    return { ok: true, data: reactionDataOf(messageId, emoji), status: 200 };
  }
  if (!isReactionAllowed(existing.size)) {
    return { ok: false, status: 409, error: REACTION_LIMIT_REACHED_MESSAGE, code: 'REACTION_LIMIT_REACHED' };
  }
  mine.set(messageId, new Set(existing).add(emoji));
  return { ok: true, data: reactionDataOf(messageId, emoji), status: 201 };
}

/** Miroir `reactions.ts:279-425` (`DELETE /api/v1/reactions/:messageId/:emoji`). */
export function fixtureRemoveReaction(params: {
  readonly messageId: string;
  readonly emoji: string;
}): ApiResult<{ readonly message: string }> {
  const { messageId, emoji } = params;
  const existing = mine.get(messageId);
  if (existing === undefined || !existing.has(emoji)) {
    return { ok: false, status: 404, error: 'Réaction introuvable' };
  }
  const next = new Set(existing);
  next.delete(emoji);
  mine.set(messageId, next);
  return { ok: true, data: { message: 'Réaction retirée' }, status: 200 };
}
