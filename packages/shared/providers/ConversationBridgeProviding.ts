/**
 * Protocole du pont ✦ — LWS-2bis, gelé ici (S1).
 *
 * Un seul protocole, deux implémentations : `LocalBridgeProvider` (substitut,
 * M-047 — exécute `buildBridgeData`, LWS-1, sur les messages déjà en cache
 * côté client) et `GatewayBridgeProvider` (définitif, G-124 — lit le champ
 * `bridge` du payload de la gateway, LWS-4). La bascule de LWS-3/4 change
 * l'injection, JAMAIS une ligne d'UI : aucune vue ne sait laquelle des deux
 * répond (garde source : aucun fichier de peau ne nomme `Local…Provider` ni
 * `Gateway…Provider`).
 *
 * Zéro donnée fabriquée : un provider calcule moins, ou rend `null`. Il
 * n'invente jamais un pont. `isComplete: false` signale que la fenêtre de
 * calcul du provider ne couvre pas tout l'intervalle non lu (typiquement
 * `LocalBridgeProvider`, borné aux messages déjà en cache) — l'UI porte
 * alors la mention « sur les N derniers messages », jamais un chiffre
 * extrapolé. `null` signale qu'il n'y a rien à montrer (ex. zéro non-lu —
 * voir `buildBridgeData`, LWS-1, qui rend `null` et jamais un pont vide).
 *
 * @see tasks/lentille-implementation-contract.md LWS-2bis
 * @see tasks/lentille-focal-workshop.md §4.2
 */
import type { ConversationBridge } from '../types/conversation-bridge.js'

export type ConversationBridgeInput = {
  conversationId: string
  viewerId: string
  unreadCount: number
}

export type ConversationBridgeResult = {
  bridge: ConversationBridge
  /**
   * `false` quand la fenêtre de calcul du provider ne couvre pas tout
   * l'intervalle non lu. L'UI porte alors « sur les N derniers messages » —
   * jamais un chiffre extrapolé au-delà de ce que le provider a réellement
   * vu.
   */
  isComplete: boolean
}

export interface ConversationBridgeProviding {
  /**
   * Calcule (substitut) ou lit (définitif) le pont ✦ d'une conversation.
   * `null` quand il n'y a rien à montrer — jamais un pont vide fabriqué
   * pour combler l'absence de donnée.
   */
  bridgeFor(input: ConversationBridgeInput): Promise<ConversationBridgeResult | null>
}
