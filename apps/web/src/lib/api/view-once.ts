import type { QueryClient } from '@tanstack/react-query';

import type { ConversationsDeps } from './conversations';
import { recordViewOnceConsumption } from './fixtures';
import { findCachedThreadMessage, patchThreadMessages } from './messages';
import { outcomeOf } from './outcome';
import type { Attachment, Message } from './types';
import { sealViewOnceIn } from './view-once-seal';
import type { Transport } from '../net/transport';

/**
 * LE PORT SERVEUR DE LA CONSOMMATION D'UNE VUE UNIQUE (D-10, D-23, #5676).
 *
 * Route RÉELLE, lue et citée — aucune n'est inventée :
 *   `POST /api/v1/conversations/:id/messages/:messageId/consume`, SANS
 *   corps, `preValidation: [requiredAuth]`
 *   (`services/gateway/src/routes/conversations/messages-view-once.ts:34-73`).
 *   200 `{ success: true, data: { messageId, viewOnceCount, maxViewOnceCount,
 *   isFullyConsumed } }` (`:50-62`, `:172`).
 *
 * Le CÂBLAGE réseau est BRANCHÉ depuis #7224 : `consumeViewOnceOptimistic`
 * (plus bas) est le SITE UNIQUE qui applique la consommation au cache, la dit
 * au serveur et défait son écriture sur un refus PERMANENT — l'écran ne tient
 * plus aucune moitié de cette loi. `applyConsumption` sert AUSSI l'événement pair `message:consumed`
 * (mêmes champs, `MessageConsumedEventData`,
 * `packages/shared/types/socketio-events/message.ts:124-131`) : un seul
 * réducteur pour la réponse REST et l'événement socket.
 */
export type ViewOnceConsumption = {
  readonly messageId: string;
  readonly viewOnceCount: number;
  readonly maxViewOnceCount: number;
  readonly isFullyConsumed: boolean;
};

/** Compose la requête EXACTE de la route (`messages-view-once.ts:34-73`) : POST, sans corps. */
export function consumeViewOnce(
  transport: Transport,
  ids: { readonly conversationId: string; readonly messageId: string },
): Promise<unknown> {
  return transport({
    method: 'POST',
    path: `/api/v1/conversations/${ids.conversationId}/messages/${ids.messageId}/consume`,
  });
}

/**
 * Applique la consommation au fil — IMMUABLE : seul le message concerné
 * change de référence, les autres restent `toBe`-identiques (zéro re-rendu
 * inutile, la promesse `memo` de `focal-row.tsx`/`FocalRow`).
 */
export function applyConsumption(
  messages: readonly Message[],
  event: Pick<ViewOnceConsumption, 'messageId' | 'viewOnceCount'>,
): readonly Message[] {
  return messages.map((message) =>
    message.id === event.messageId ? { ...message, viewOnceCount: event.viewOnceCount } : message,
  );
}

/**
 * LES FICHIERS D'UNE VUE UNIQUE REFERMÉE QUITTENT LES CACHES DU NAVIGATEUR
 * (#7580). Le service worker met les médias en cache à leur premier
 * affichage ; la purge du fil ne les atteindrait pas. `caches` absent (tests,
 * contexte non sécurisé) ⇒ rien à faire. Une panne ne remonte jamais : la
 * puce « Déjà ouvert » ne dépend pas de ce ménage.
 */
export async function purgeViewOnceMedia(urls: readonly string[]): Promise<void> {
  const storage = (globalThis as { readonly caches?: CacheStorage }).caches;
  if (storage === undefined || urls.length === 0) return;
  try {
    const names = await storage.keys();
    await Promise.all(
      names.map(async (name) => {
        const cache = await storage.open(name);
        await Promise.all(urls.map((url) => cache.delete(url, { ignoreSearch: true })));
      }),
    );
  } catch {
    return;
  }
}

/** Les URL qu'une rangée a pu faire télécharger — le fichier et sa vignette. */
export function viewOnceMediaUrlsOf(attachments: readonly Attachment[] | undefined): readonly string[] {
  return (attachments ?? []).flatMap((attachment) =>
    [attachment.fileUrl, attachment.thumbnailUrl].filter((url): url is string => typeof url === 'string' && url !== ''),
  );
}

export type ConsumeViewOnceDeps = ConversationsDeps & { readonly queryClient: QueryClient };

/**
 * LE COMPTE QUE LA PASSERELLE SERT (#7224) — `data.viewOnceCount` de la
 * réponse 200 (`messages-view-once.ts:50-62`), lu sur la FORME et jamais
 * supposé : un budget de plusieurs vues (`maxViewOnceCount > 1`) rend 2, 3 …
 * et c'est CE compte qui doit atteindre la rangée, pas le `1` que l'optimisme
 * avait posé. Une charge qui ne le porte pas laisse l'écriture optimiste en
 * place — elle n'est jamais REMPLACÉE par une supposition.
 */
function servedViewOnceCount(result: unknown): number | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  const data = (result as { readonly data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return undefined;
  const count = (data as { readonly viewOnceCount?: unknown }).viewOnceCount;
  return typeof count === 'number' ? count : undefined;
}

/** L'écriture du compte sur LA rangée visée — `applyConsumption` est déjà
 * cette écriture (elle POSE `viewOnceCount`). */
function writeViewOnceCount(
  deps: ConsumeViewOnceDeps,
  conversationId: string,
  event: Pick<ViewOnceConsumption, 'messageId' | 'viewOnceCount'>,
): void {
  patchThreadMessages(deps.queryClient, conversationId, (messages) => applyConsumption(messages, event));
}

/** Le ROLLBACK CIBLÉ d'un refus permanent : la rangée d'avant, et elle seule —
 * jamais un instantané entier du fil par-dessus ce qu'un message arrivé
 * entre-temps (`message:new`) y a écrit. */
function restoreMessage(deps: ConsumeViewOnceDeps, conversationId: string, previous: Message): void {
  patchThreadMessages(deps.queryClient, conversationId, (messages) =>
    messages.map((message) => (message.id === previous.id ? previous : message)),
  );
}

/**
 * LA RÉVÉLATION SE DIT AU SERVEUR (#7224) — LA MÊME discipline optimiste que
 * `markCaughtUp` (`receipts.ts`) : le cache porte la consommation AVANT que le
 * réseau ne confirme (la révélation n'attend aucun aller-retour, dimension 2),
 * un refus PERMANENT (4xx hors `RETRYABLE_CLIENT_STATUSES`) la DÉFAIT et rend
 * `false` — l'écran montre alors sa légende d'échec (`REVEAL_ERROR_NOTICE_MS`)
 * et ne révèle rien —, une panne (réseau, 429, 5xx) la LAISSE : le secret est
 * déjà lu, le rouvrir serait pire que de le compter deux fois.
 *
 * Le succès réécrit le compte SERVI (`servedViewOnceCount`) : la valeur du
 * serveur atteint la rangée, elle ne s'arrête pas au port.
 *
 * `source !== 'gateway'` (fixtures) : la consommation est écrite au cache ET
 * au registre qui survit au démontage (`recordViewOnceConsumption`,
 * `fixtures.ts` § revue #5676 défaut 7) — sans l'écriture CACHE, une rangée
 * recyclée par le virtualiseur remonterait sur un `viewOnceCount: 0` et
 * rouvrirait le secret dans la MÊME session.
 *
 * SITE UNIQUE : `routes/thread.tsx` n'en tient plus aucune moitié — c'est ce
 * qui rend cette loi témoignable sans monter l'écran (budget de fichier, et
 * la leçon « une loi qui habite un écran est intestable »).
 */
export async function consumeViewOnceOptimistic(params: {
  readonly conversationId: string;
  readonly messageId: string;
  readonly deps: ConsumeViewOnceDeps;
}): Promise<boolean> {
  const { conversationId, messageId, deps } = params;
  const previous = findCachedThreadMessage(deps.queryClient, conversationId, messageId);

  /* L'OUVERTURE EST LA CONSOMMATION, ET LA CONSOMMATION EST LA PURGE (#7580) :
     la rangée passe « déjà ouverte » et perd son contenu AVANT l'aller-retour.
     Ce que le lecteur regarde pendant sa fenêtre, `ProtectedContent` l'a figé
     au toucher — la purge n'éteint pas ce qu'il est en train de lire. */
  patchThreadMessages(deps.queryClient, conversationId, (messages) =>
    applyConsumption(sealViewOnceIn(messages, messageId), { messageId, viewOnceCount: Math.max(1, previous?.viewOnceCount ?? 0) }),
  );

  if (__FIXTURES__ && deps.source === 'fixtures') {
    recordViewOnceConsumption(messageId);
    return true;
  }

  let result: unknown;
  try {
    result = await consumeViewOnce(deps.transport, { conversationId, messageId });
  } catch {
    return true;
  }

  const outcome = outcomeOf(result);
  if (outcome === 'permanent') {
    if (previous !== undefined) restoreMessage(deps, conversationId, previous);
    return false;
  }

  if (outcome === 'success') {
    const served = servedViewOnceCount(result);
    if (served !== undefined) writeViewOnceCount(deps, conversationId, { messageId, viewOnceCount: served });
  }

  return true;
}
