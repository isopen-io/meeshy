import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ConversationLanguageChanges' });

/**
 * Ce qui change la COMPOSITION LINGUISTIQUE d'une conversation — l'ensemble des
 * langues vers lesquelles un message doit partir (#9708).
 *
 * Les langues d'une conversation sont mises en cache (`ConversationLanguages`)
 * parce que les relire coûte une jointure participants × comptes par message.
 * Ce cache n'avait AUCUNE invalidation : un invité anglophone qui rejoignait une
 * conversation `[fr]` lisait du français pendant ses cinq premières minutes —
 * le journal disait `Langues depuis cache: [fr]` et le traducteur ne recevait
 * rien. Toute porte qui fait ENTRER, SORTIR ou CHANGER DE LANGUE un lecteur
 * l'annonce ici, après son écriture, et le cache l'entend.
 *
 * - `arrival` : un participant actif de plus (création ou retour), avec la
 *   langue de sa ligne. C'est aussi ce qui déclenche la traduction de
 *   l'historique récent vers cette langue (#9709).
 * - `departure` : un participant actif de moins.
 * - `reader-languages` : un COMPTE a changé ses préférences de langue. Ses
 *   conversations ne sont pas connues ici : toutes sont invalidées.
 *
 * **Le bus est EN MÉMOIRE, dans le processus.** Une passerelle à plusieurs
 * instances n'entendrait que ses propres annonces ; le TTL court du cache
 * (`CONVERSATION_LANGUAGES_TTL_MS`) borne alors le retard des autres. Le jour
 * où la passerelle se démultiplie, c'est ici — et seulement ici — qu'un relais
 * Redis pub/sub se branche.
 */
export type ConversationLanguageChange =
  | {
      readonly kind: 'arrival';
      readonly conversationId: string;
      readonly language: string;
      /** Le compte qui arrive — `null` pour un invité sans ligne `User`. Son masquage personnel borne le rattrapage. */
      readonly readerUserId: string | null;
    }
  | { readonly kind: 'departure'; readonly conversationId: string }
  | { readonly kind: 'reader-languages'; readonly userId: string };

export type ConversationLanguageListener = (change: ConversationLanguageChange) => void;

const listeners = new Set<ConversationLanguageListener>();

export function subscribeConversationLanguageChanges(listener: ConversationLanguageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Synchrone : l'invalidation est faite quand l'annonce rend la main, donc AVANT
 * que la porte qui l'a émise ne réponde — le premier message posté après une
 * arrivée la voit. Un écouteur qui lève n'empêche ni les autres, ni l'appelant :
 * l'arrivée a eu lieu, quoi qu'il advienne de ses à-côtés.
 */
export function announceConversationLanguageChange(change: ConversationLanguageChange): void {
  for (const listener of [...listeners]) {
    try {
      listener(change);
    } catch (error) {
      logger.warn('conversation language listener failed', { kind: change.kind, error });
    }
  }
}
