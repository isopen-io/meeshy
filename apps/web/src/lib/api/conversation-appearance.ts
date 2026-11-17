import type { QueryClient } from '@tanstack/react-query';
import * as userPreferencesEndpoints from '@meeshy/shared/api/endpoints/user-preferences';
import type { ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';

import { rawAppearanceOf, withAppearance, withRawAppearance } from '@/lib/appearance/read';

import { conversationQueryKey, findCachedConversation, patchConversation, patchConversationDetail, type ConversationsDeps } from './conversations';
import type { Conversation } from './types';

/**
 * **CHOISIR LE FOND ET L'ACCENT D'UNE CONVERSATION** (#10631, § 10.1) —
 * `PUT /user-preferences/conversations/:id { appearance }`. La même loi que les
 * autres préférences du lecteur :
 *
 * 1. CAPTURER l'état d'avant (la valeur BRUTE, absence de clé comprise) ;
 * 2. APPLIQUER au toucher, dans la liste ET dans la fiche du fil — le fond, la
 *    ligne de liste, l'en-tête et le composeur se relisent du cache, sans
 *    réseau ni spinner ;
 * 3. ENVOYER ;
 * 4. un REFUS (4xx, panne, délai) RÉTABLIT l'état d'avant et le DIT — mais
 *    seulement si rien d'autre n'a été choisi entre-temps : un second toucher
 *    plus rapide que le premier échec n'est pas écrasé.
 *
 * `null` remet Signature + accent calculé.
 */
export type AppearanceOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string | null };

type Deps = Pick<ConversationsDeps, 'source' | 'transport'> & { readonly queryClient: QueryClient };

const cachedConversation = (queryClient: QueryClient, conversationId: string): Conversation | undefined =>
  findCachedConversation(queryClient, conversationId) ?? queryClient.getQueryData<Conversation>(conversationQueryKey(conversationId));

const patchBoth = (queryClient: QueryClient, conversationId: string, edit: (conversation: Conversation) => Conversation): void => {
  patchConversation(queryClient, conversationId, edit);
  patchConversationDetail(queryClient, conversationId, edit);
};

const sameRaw = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export async function chooseAppearance(params: {
  readonly conversationId: string;
  readonly appearance: ConversationAppearance | null;
  readonly deps: Deps;
}): Promise<AppearanceOutcome> {
  const { conversationId, appearance, deps } = params;
  const { queryClient } = deps;
  const before = cachedConversation(queryClient, conversationId);
  if (before === undefined) return { ok: false, code: null };
  const previous = rawAppearanceOf(before);

  patchBoth(queryClient, conversationId, (conversation) => withAppearance(conversation, appearance));
  if (deps.source !== 'gateway') return { ok: true };

  const result = await deps.transport.request<unknown>({
    method: 'PUT',
    path: userPreferencesEndpoints.conversationsByConversationId(conversationId),
    body: { appearance },
  });
  if (result.ok) return { ok: true };

  const current = cachedConversation(queryClient, conversationId);
  const stillOurs = current !== undefined && sameRaw(rawAppearanceOf(current).value, appearance);
  if (stillOurs) patchBoth(queryClient, conversationId, (conversation) => withRawAppearance(conversation, previous));
  return { ok: false, code: result.code ?? null };
}
