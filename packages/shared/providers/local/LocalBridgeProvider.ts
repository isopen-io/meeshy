/**
 * Substitut local du pont ✦ — M-047, LWS-2bis.
 *
 * Implémentation `ConversationBridgeProviding` (`../ConversationBridgeProviding.ts`,
 * gelé S1) qui exécute `buildBridgeData` (LWS-1, `../../utils/conversation-bridge.ts`)
 * sur les messages DÉJÀ EN CACHE côté client. Construit par injection d'UNE
 * dépendance, `LocalBridgeCacheReading` — deux méthodes minimales que le
 * client web/iOS branche sur son propre cache (IndexedDB, Core Data,
 * mémoire…) ; ce fichier ne connaît AUCUN de ces détails de plateforme.
 *
 * ZÉRO donnée fabriquée (contrat LWS-2bis) :
 * - `getUnreadWindow(conversationId)` rend `null` ⇒ le provider rend `null`
 *   — la fenêtre non lue n'est pas connue localement, rien à annoncer.
 * - `getCachedMessages(conversationId)` rend `null` ⇒ le provider rend `null`
 *   — pas de messages en cache pour reconstituer le pont.
 * - `buildBridgeData` rend `null` (0 non-lu, ou tous les messages de la
 *   fenêtre sont ceux du lecteur) ⇒ le provider rend `null`, sans jamais
 *   fabriquer un pont aux champs vides.
 * - Fenêtre connue mais PARTIELLE (`windowCoversUnread: false`, cache borné
 *   aux N derniers messages) ⇒ `isComplete: false` SUR le pont rendu — le
 *   champ vit sur `ConversationBridge`, jamais dans une enveloppe de retour
 *   (REV-1, blocage 6, voir `ConversationBridgeProviding.ts`).
 *
 * `suggestedMode` — DÉCISION CONTRACTUELLE DE CE SUBSTITUT (M-047) : la vraie
 * décision d'orchestrateur (`resolveOrchestratorDecision`,
 * `../../utils/reading-modes.ts`) exige `capabilities` (catalogue de modes
 * du lecteur) et `stickyChoice` (préférence mémorisée), deux entrées que ce
 * provider n'a pas et qu'il n'a pas le droit d'inventer — les fabriquer
 * violerait la contrainte « zéro donnée fabriquée » du contrat LWS-2bis.
 * `LocalBridgeProvider` reproduit donc UNIQUEMENT la branche PAR DÉFAUT de
 * l'orchestrateur (§5 de `resolveOrchestratorDecision` : `unreadCount <=
 * ORCHESTRATOR_UNREAD_CAP` ⇒ `'focal'`, sinon Résumé Vivant ⇒ `'resume'`),
 * en IMPORTANT le seuil `ORCHESTRATOR_UNREAD_CAP` depuis la loi plutôt que
 * de le redupliquer en dur. Ce n'est PAS le calcul final : la surcouche
 * gateway (`GatewayBridgeProvider`, G-124, dossier A6/G-123) le remplacera
 * par la vraie décision d'orchestrateur, capacités et choix collant compris,
 * sans changer une ligne d'UI (bascule d'injection uniquement).
 *
 * GARDE SOURCE (contrat LWS-2bis) : aucun fichier de peau (vue, composant
 * d'UI) ne doit jamais nommer `LocalBridgeProvider` — seule la couche
 * d'injection choisit entre ce substitut et `GatewayBridgeProvider`. Une
 * garde source vérifie l'absence de ce nom hors providers/injection.
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis
 * @see tasks/lentille-workshop-execution.md M-047
 */
import { buildBridgeData, type BridgeMessage } from '../../utils/conversation-bridge.js'
import { ORCHESTRATOR_UNREAD_CAP } from '../../utils/reading-modes.js'
import type { ConversationBridge } from '../../types/conversation-bridge.js'
import type { ConversationBridgeInput, ConversationBridgeProviding } from '../ConversationBridgeProviding.js'

/**
 * Fenêtre de non-lus connue localement : `unreadCount` est le nombre de
 * messages non lus COUVERTS par le cache disponible, `windowCoversUnread`
 * dit si ce cache couvre TOUT l'intervalle non lu (`true`) ou seulement une
 * borne récente (`false`, typiquement un cache limité aux N derniers
 * messages). Les deux voyagent ensemble : c'est la même fenêtre qui définit
 * le compte ET sa complétude.
 */
export type LocalBridgeUnreadWindow = {
  readonly unreadCount: number
  readonly windowCoversUnread: boolean
}

/**
 * Dépendance minimale injectée dans `LocalBridgeProvider` — le client
 * web/iOS branche ces deux méthodes sur son propre cache. Interface
 * volontairement étroite : aucune méthode réseau, aucun objet de
 * configuration, seulement ce que `bridgeFor` a besoin de lire.
 */
export interface LocalBridgeCacheReading {
  /** `null` quand aucun message n'est en cache pour cette conversation. */
  getCachedMessages(conversationId: string): readonly BridgeMessage[] | null
  /** `null` quand la fenêtre de non-lus n'est pas connue localement. */
  getUnreadWindow(conversationId: string): LocalBridgeUnreadWindow | null
}

export class LocalBridgeProvider implements ConversationBridgeProviding {
  constructor(private readonly cache: LocalBridgeCacheReading) {}

  async bridgeFor(input: ConversationBridgeInput): Promise<ConversationBridge | null> {
    const window = this.cache.getUnreadWindow(input.conversationId)
    if (window === null) return null

    const messages = this.cache.getCachedMessages(input.conversationId)
    if (messages === null) return null

    const data = buildBridgeData({
      messages,
      viewerId: input.viewerId,
      unreadCount: window.unreadCount,
    })
    if (data === null) return null

    return {
      kind: 'fallback',
      unreadCount: window.unreadCount,
      suggestedMode: window.unreadCount <= ORCHESTRATOR_UNREAD_CAP ? 'focal' : 'resume',
      data,
      ...(window.windowCoversUnread ? {} : { isComplete: false }),
    }
  }
}
