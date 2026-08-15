/**
 * Substitut local de l'appel en cours sur le rang (section EN DIRECT) —
 * M-047, LWS-2bis.
 *
 * Implémentation `ConversationLiveCallProviding`
 * (`../ConversationLiveCallProviding.ts`, gelé S1) : un registre en mémoire
 * alimenté par `noteLiveCall(conversationId, liveCall)` — le client
 * web/iOS pousse ici l'état d'appel qu'il connaît déjà (ex. état de room
 * WebRTC/LiveKit tenu ailleurs dans l'app), ce provider ne monte AUCUNE
 * connexion, AUCUN socket, il se contente de refléter ce qu'on lui a dit.
 *
 * Un appel inconnu (jamais noté, ou noté puis effacé via `noteLiveCall(id,
 * null)`) rend `null` — jamais inventé. La section EN DIRECT reste vide
 * plutôt que fausse (contrat gelé, LWS-2bis).
 *
 * GARDE SOURCE (contrat LWS-2bis) : aucun fichier de peau ne doit nommer
 * `LocalLiveCallProvider` directement — seule la couche d'injection choisit
 * l'implémentation.
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis
 * @see tasks/lentille-workshop-execution.md M-047
 */
import type { ConversationLiveCall } from '../../types/conversation-bridge.js'
import type { ConversationLiveCallProviding } from '../ConversationLiveCallProviding.js'

type ChangeListener = (conversationId: string, liveCall: ConversationLiveCall | null) => void

export class LocalLiveCallProvider implements ConversationLiveCallProviding {
  private readonly calls = new Map<string, ConversationLiveCall>()
  private readonly listeners = new Set<ChangeListener>()

  /**
   * Enregistre (ou efface, avec `liveCall: null`) l'état d'appel connu du
   * client pour `conversationId`, et notifie les abonnés `onChange`.
   */
  noteLiveCall(conversationId: string, liveCall: ConversationLiveCall | null): void {
    if (liveCall === null) {
      this.calls.delete(conversationId)
    } else {
      this.calls.set(conversationId, liveCall)
    }
    this.listeners.forEach((listener) => listener(conversationId, liveCall))
  }

  liveCallFor(conversationId: string): ConversationLiveCall | null {
    return this.calls.get(conversationId) ?? null
  }

  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb)
    let unsubscribed = false
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      this.listeners.delete(cb)
    }
  }
}
