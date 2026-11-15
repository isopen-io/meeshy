/**
 * « Ce lecteur a-t-il CETTE conversation ouverte au premier plan ? » (#8892, #14147) — la
 * question que `ConversationViewingHandler` sait répondre, posée par qui n'a pas le handler
 * sous la main (le relais de la batterie : « en conversation » commence par l'écran ouvert).
 *
 * Le registre est LOCAL AU NŒUD, comme celui du handler. Sans handler enregistré, la réponse
 * est `false` : le contexte se rabat sur les deux autres signaux (échange récent, réponse
 * attendue), jamais sur une supposition.
 */
export type ConversationViewingProbe = (userId: string, conversationId: string) => boolean;

let probe: ConversationViewingProbe = () => false;

export function setConversationViewingProbe(next: ConversationViewingProbe): void {
  probe = next;
}

export function isViewingConversation(userId: string, conversationId: string): boolean {
  return probe(userId, conversationId);
}
