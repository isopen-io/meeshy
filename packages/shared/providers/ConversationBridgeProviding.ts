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
 * n'invente jamais un pont. `bridge.isComplete === false` signale que la
 * fenêtre de calcul du provider ne couvre pas tout l'intervalle non lu
 * (typiquement `LocalBridgeProvider`, borné aux messages déjà en cache) —
 * l'UI porte alors la mention « sur les N derniers messages », jamais un
 * chiffre extrapolé. `null` signale qu'il n'y a rien à montrer (ex. zéro
 * non-lu — voir `buildBridgeData`, LWS-1, qui rend `null` et jamais un pont
 * vide).
 *
 * ── Pourquoi le protocole rend un `ConversationBridge` nu (REV-1, blocage 6) ──
 * `ConversationBridgeResult` enveloppait le pont pour lui adjoindre
 * `isComplete`. L'enveloppe s'arrêtait à l'appelant immédiat : le pont, lui,
 * poursuit sa route — cache, socket, modèle de liste, rang — et la
 * qualification de sa fenêtre serait tombée au premier relais, laissant le
 * rang afficher un décompte partiel comme un décompte total. Le champ vit
 * donc SUR le pont (`ConversationBridgeSchema.isComplete`, absent = complet),
 * et l'enveloppe n'a plus rien à porter : elle est supprimée plutôt que
 * conservée vide. Aucune implémentation n'était committée au moment du
 * changement (`LocalBridgeProvider` = M-047, `GatewayBridgeProvider` = G-124),
 * la simplification ne casse donc aucun appelant.
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

export interface ConversationBridgeProviding {
  /**
   * Calcule (substitut) ou lit (définitif) le pont ✦ d'une conversation.
   * `null` quand il n'y a rien à montrer — jamais un pont vide fabriqué
   * pour combler l'absence de donnée. Une fenêtre partielle se déclare par
   * `isComplete: false` SUR le pont rendu, jamais par une enveloppe.
   */
  bridgeFor(input: ConversationBridgeInput): Promise<ConversationBridge | null>
}
