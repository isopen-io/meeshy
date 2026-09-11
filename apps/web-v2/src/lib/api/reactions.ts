import type { QueryClient } from '@tanstack/react-query';
import { isReactionAllowed, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import type { ReactionData } from '@meeshy/shared/types/reaction';

import { fixtureAddReaction, fixtureRemoveReaction } from './fixtures-reactions';
import { messagesQueryKey } from './messages';
import { mineOf, reactionStore } from './reaction-store';
import { outcomeOf } from './outcome';
import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import type { Message } from './types';

/**
 * LE PORT DES RÉACTIONS (#5814, § 3) — `POST /api/v1/reactions`
 * (`services/gateway/src/routes/reactions.ts:72-92`) et
 * `DELETE /api/v1/reactions/:messageId/:emoji` (`:279-296`), les DEUX
 * `requiredAuth` `allowAnonymous: true`. En source `fixtures`, le bouchon
 * `fixtures-reactions.ts` MIME la même forme (201/200/409, 200/404) — les
 * réactions, à la différence des actions de rangée, passent par un « réseau »
 * même en fixtures, parce que le plafond et l'idempotence sont un
 * COMPORTEMENT du chantier, pas seulement de la passerelle.
 */

export function addReaction(
  deps: ConversationsDeps,
  params: { readonly messageId: string; readonly emoji: string },
): Promise<ApiResult<ReactionData>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return Promise.resolve(fixtureAddReaction(params));
  return deps.transport.request<ReactionData>({ method: 'POST', path: '/api/v1/reactions', body: params });
}

export function removeReaction(
  deps: ConversationsDeps,
  params: { readonly messageId: string; readonly emoji: string },
): Promise<ApiResult<{ readonly message: string }>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return Promise.resolve(fixtureRemoveReaction(params));
  return deps.transport.request<{ readonly message: string }>({
    method: 'DELETE',
    path: `/api/v1/reactions/${params.messageId}/${encodeURIComponent(params.emoji)}`,
  });
}

/**
 * Applique un delta ±1 au compte d'UN emoji sur UN message — IMMUABLE :
 * `messages.map` ne change de référence que sur le message concerné (T6,
 * `toBe`-identiques ailleurs, la promesse `memo` de `FocalRow`). `+1` crée
 * la clé si absente ; `−1` la retire à 0 (jamais un compte négatif exposé).
 */
export function applyReactionDelta(
  messages: readonly Message[],
  event: { readonly messageId: string; readonly emoji: string; readonly delta: 1 | -1 },
): readonly Message[] {
  return messages.map((m) => {
    if (m.id !== event.messageId) return m;
    const current = m.reactionSummary ?? {};
    const nextCount = Math.max(0, (current[event.emoji] ?? 0) + event.delta);
    const nextSummary: Record<string, number> = { ...current };
    if (nextCount === 0) delete nextSummary[event.emoji];
    else nextSummary[event.emoji] = nextCount;
    return { ...m, reactionSummary: nextSummary };
  });
}

export type ReactionPlan = 'add' | 'remove' | 'refused';

/**
 * `add` si l'emoji n'est pas « mien » sur ce message, `remove` sinon ;
 * `refused` quand une addition franchirait le plafond de
 * `@meeshy/shared/utils/reaction-limit.ts` (`isReactionAllowed`, JAMAIS
 * réécrit ici) — le sixième emoji DIFFÉRENT d'une même personne sur un même
 * message (retirer une réaction n'est jamais refusé).
 */
export function toggleReactionPlan(input: { readonly mine: readonly string[]; readonly emoji: string }): ReactionPlan {
  if (input.mine.includes(input.emoji)) return 'remove';
  return isReactionAllowed(input.mine.length) ? 'add' : 'refused';
}

export type ReactionOutcome = 'confirmed' | 'unchanged' | 'rolledBack' | 'kept';

/** 201 ⇒ confirmed ; 200 ⇒ unchanged ; 4xx (hors 408/425/429) ⇒ rolledBack ;
 * réseau/5xx/retryable ⇒ kept (D-26 F4, `outcomeOf` — jamais réécrit). */
export function reactionOutcome(result: ApiResult<unknown>): ReactionOutcome {
  if (result.ok) return result.status === 201 ? 'confirmed' : 'unchanged';
  return outcomeOf(result) === 'permanent' ? 'rolledBack' : 'kept';
}

export type PerformReactionDeps = ConversationsDeps & {
  readonly queryClient: QueryClient;
};

/**
 * ANNONCÉE, PAS AVALÉE (revue #5814, défaut majeur 3) — avant ce correctif,
 * une réaction posée hors ligne (ou devant un 5xx/`TIMEOUT` retryable,
 * outcome `kept`) rendait `{ ok: true }` SANS DISTINCTION avec une réaction
 * réellement confirmée : l'optimiste restait affiché, rien ne disait qu'elle
 * n'avait pas atteint la passerelle. `notice` porte cette DIFFÉRENCE — un
 * texte à annoncer bien que l'issue reste `ok` (l'optimiste RESTE, ce n'est
 * PAS un échec) — sans quoi l'appelant ne peut pas distinguer les deux.
 *
 * NE PROMET PAS DE RENVOI (revue-correction #5814, défaut majeur 1) — le
 * libellé disait « sera renvoyée à la reconnexion » alors qu'AUCUN code ne
 * rejoue quoi que ce soit (la file de reprise est l'issue compagnon #5868,
 * OUVERTE, non livrée ce lot) : le produit affirmait un comportement qu'il
 * n'a pas. Le texte ne dit plus que ce que `performReaction` fait réellement
 * — l'optimiste reste posé, hors ligne, sans promesse de rejeu.
 */
export const REACTION_PENDING_MESSAGE = 'Réaction non confirmée — hors ligne';

export type PerformReactionResult =
  | { readonly ok: true; readonly notice?: string }
  | { readonly ok: false; readonly message: string };

/**
 * LE SITE UNIQUE (#5814, § 3/§ 5 étape 3) — plan → override optimiste
 * (cache des messages + `reactionStore`) → appel réseau → issue :
 *
 *  - `refused` (plafond) : AUCUN appel, aucune écriture — annonce le refus.
 *  - `kept` (hors ligne/5xx, D-26 F4) : l'optimiste RESTE (pas d'outbox ce
 *    lot — issue compagnon « file de reprise »).
 *  - `rolledBack` (4xx) : le delta ET « mien » sont DÉFAITS — annonce l'échec.
 *    EXCEPTION : un `remove` refusé en 404 n'est pas défait — la passerelle
 *    confirme que la réaction n'existe pas, l'optimiste (déjà retiré) reste
 *    retiré, sans annonce d'échec (défaut majeur 1, revue-correction).
 *  - `unchanged` (200 sur un AJOUT) : la réaction existait d'une session
 *    PRÉCÉDENTE — le `+1` optimiste est ANNULÉ (déjà compté côté serveur),
 *    « mien » RESTE vrai (§ 3 conséquence 1).
 *  - `confirmed` : l'optimiste reflète déjà la réalité, rien de plus.
 */
export async function performReaction(params: {
  readonly conversationId: string;
  readonly messageId: string;
  readonly emoji: string;
  readonly deps: PerformReactionDeps;
}): Promise<PerformReactionResult> {
  const { conversationId, messageId, emoji, deps } = params;
  const plan = toggleReactionPlan({ mine: mineOf(messageId), emoji });

  if (plan === 'refused') return { ok: false, message: REACTION_LIMIT_REACHED_MESSAGE };

  const delta: 1 | -1 = plan === 'add' ? 1 : -1;
  const key = messagesQueryKey(conversationId);
  const applyDelta = (d: 1 | -1) =>
    deps.queryClient.setQueryData<{ readonly messages: readonly Message[]; readonly hasOlder: boolean }>(
      key,
      (page) => (page === undefined ? page : { ...page, messages: applyReactionDelta(page.messages, { messageId, emoji, delta: d }) }),
    );

  applyDelta(delta);
  if (plan === 'add') reactionStore.getState().add(messageId, emoji);
  else reactionStore.getState().remove(messageId, emoji);

  let result: ApiResult<unknown>;
  try {
    result = plan === 'add' ? await addReaction(deps, { messageId, emoji }) : await removeReaction(deps, { messageId, emoji });
  } catch {
    // panne réseau — TRANSIENT (kept) : l'optimiste RESTE, mais ANNONCÉ
    // (revue #5814, défaut majeur 3) — un silence complet ici est
    // indiscernable d'une confirmation.
    return { ok: true, notice: REACTION_PENDING_MESSAGE };
  }

  const outcome = reactionOutcome(result);
  if (outcome === 'confirmed') return { ok: true };
  if (outcome === 'kept') return { ok: true, notice: REACTION_PENDING_MESSAGE };

  if (outcome === 'rolledBack') {
    // UN RETRAIT REFUSÉ EN 404 NE SE ROLLBACK PAS (revue-correction #5814,
    // défaut majeur 1 — le fantôme du correctif 5) — un `remove` posé sur un
    // emoji qui n'a jamais atteint la passerelle (réaction posée `kept`,
    // jamais confirmée, mais persistée dans `reactionStore.mine` par le
    // correctif 5 d'une session à l'autre) rend un 404 : LA PASSERELLE DIT
    // QUE LA RÉACTION N'EXISTE PAS. La restaurer (`applyDelta(+1)` +
    // `reactionStore.add`) re-gonfle un compte fantôme et re-pose « mien » —
    // le tap suivant retombe sur le même 404, à l'infini (loi 4 : le
    // contrôle de retrait devient INERTE). Le 404 sur un retrait est donc
    // une RÉCONCILIATION, pas un échec : le compte serveur (sans cet emoji)
    // fait foi, l'optimiste — déjà retiré avant l'appel réseau — reste
    // retiré, aucune annonce d'échec.
    if (plan === 'remove' && !result.ok && result.status === 404) {
      reactionStore.getState().remove(messageId, emoji);
      return { ok: true };
    }
    applyDelta((-delta) as 1 | -1);
    if (plan === 'add') reactionStore.getState().remove(messageId, emoji);
    else reactionStore.getState().add(messageId, emoji);
    return { ok: false, message: 'Réaction impossible' };
  }

  // `unchanged` : réponse 200 sur un AJOUT — la réaction existait déjà côté
  // serveur (session précédente) : le +1 optimiste double-compterait.
  if (plan === 'add') applyDelta(-1);
  return { ok: true };
}
