/**
 * Protocole de l'appel en cours sur le rang (section EN DIRECT) — LWS-2bis,
 * gelé ici (S1).
 *
 * Un seul protocole, deux implémentations : `LocalLiveCallProvider`
 * (substitut, M-047 — dérivé de l'état d'appel que le client connaît déjà
 * pour la conversation ouverte ; absent pour les autres) et, après LWS-4,
 * la lecture du payload `ConversationLiveCall` de la gateway (aucun champ
 * d'appel n'existe aujourd'hui sur `CoreModels.swift` — vérifié). La
 * bascule change l'injection, jamais l'UI.
 *
 * Un appel inconnu n'est PAS affiché : `null`, jamais inventé. La section
 * EN DIRECT reste vide plutôt que fausse.
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis
 * @see tasks/lentille-focal-workshop.md §4.2
 */
import type { ConversationLiveCall } from '../types/conversation-bridge.js'

export interface ConversationLiveCallProviding {
  /**
   * `null` quand l'appel de cette conversation n'est pas connu du provider
   * — jamais inventé, jamais extrapolé depuis l'état d'une autre
   * conversation.
   */
  liveCallFor(conversationId: string): ConversationLiveCall | null

  /**
   * S'abonne aux changements d'état d'appel, toutes conversations
   * confondues. Retourne une fonction de désabonnement idempotente :
   * l'appeler plusieurs fois ne doit ni lever ni notifier deux fois.
   */
  onChange(cb: (conversationId: string, liveCall: ConversationLiveCall | null) => void): () => void
}
