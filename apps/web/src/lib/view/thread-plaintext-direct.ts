import type { ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';
import { href, navigate } from '@/routes/route-table';

import type { PlaintextDirectGesture } from './plaintext-direct';
import { plaintextDirectGesture } from './plaintext-direct-gesture';

/**
 * LE GESTE DU BANDEAU D'UN TÊTE-À-TÊTE CHIFFRÉ, POUR LE FIL OUVERT (#12986,
 * #12966) — la conversation non chiffrée avec le pair s'ouvre à la place du
 * fil. Rien tant que la conversation n'est pas chargée ; le verrou ne le pose
 * que sur un tête-à-tête chiffré de bout en bout.
 */
export function threadPlaintextDirect(params: {
  readonly deps: ConversationsDeps;
  readonly conversation: Conversation | undefined;
  readonly viewerId: string;
  readonly title: string;
}): PlaintextDirectGesture | undefined {
  const { deps, conversation, viewerId, title } = params;
  if (conversation === undefined || conversation.type !== 'direct') return undefined;
  return plaintextDirectGesture({
    deps,
    conversation,
    viewerId,
    fallbackName: title,
    online: () => navigator.onLine,
    go: (id) => navigate(href('thread', { conversation: id })),
  });
}
