import { conversationActiveCallQueryKey, loadConversationActiveCall } from '@/lib/api/call-sessions';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';

/**
 * LE SONDAGE « QUEL APPEL EST EN COURS ICI ? » — une clé, une lecture, partagées
 * par la pastille de l'en-tête (`ThreadCallButton`, qui le sonde toutes les 15 s)
 * et la carte d'appel du fil (`CallNotice`, qui le reconfirme à chaque montage,
 * #19778). Chaque hôte y ajoute son rythme ; la réponse est la même pour tous.
 */
export function conversationActiveCallQuery(conversationId: string) {
  return {
    queryKey: conversationActiveCallQueryKey(conversationId),
    queryFn: async ({ signal }: { readonly signal: AbortSignal }) => unwrap(await loadConversationActiveCall(apiDeps, conversationId, signal)),
    retry: false,
  } as const;
}
