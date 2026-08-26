import Foundation
import MeeshySDK

/// `ConversationBridgeProviding` définitif (G-124) — le second des deux
/// implémentations attendues par le protocole gelé
/// (`LentilleProviders.swift`, M-048, en-tête § ConversationBridgeProviding).
/// `LocalBridgeProvider` CALCULE (miroir Swift de `buildBridgeData`, LWS-1) ;
/// `GatewayBridgeProvider` ne calcule RIEN — il RELAIE le champ `bridge` déjà
/// décodé par la couche conversations (payload REST `GET /conversations`,
/// `MeeshyConversation.bridge`, G-120..123 ; et payload socket
/// `conversation:unread-updated`, `UnreadUpdateEvent.bridge`, G-123/G-124).
///
/// **Domicile** : fichier SÉPARÉ de `LentilleProviders.swift` (gelé, M-048) —
/// son en-tête ne nomme la définitive gateway qu'en commentaire (« lot
/// ultérieur »), jamais en code ; ce type en est l'atterrissage.
///
/// **Aucune requête réseau propre.** Un registre en mémoire, nourri par
/// `note(_:for:)`/`noteBridges(from:)` au point de composition (même patron
/// que `LocalLiveCallProvider` (`LentilleProviders.swift`) :
/// registre + verrou, pas d'`onChange` ici — le protocole
/// `ConversationBridgeProviding` n'en déclare pas, contrairement à
/// `ConversationLiveCallProviding`). `bridgeFor` rend le pont enregistré tel
/// quel — `suggestedMode`/`isComplete`/`data` traversent SANS transformation,
/// ou `nil` quand rien n'est connu pour cette conversation : zéro donnée
/// fabriquée, même discipline que le reste du fichier de protocoles.
///
/// R-c (« les substituts n'ont jamais été injectés — le pont est invisible
/// drapeau ON ») : ce type EST l'injection. Le composition root
/// (`ConversationListViewModel.conversations`, `didSet`, derrière
/// `LentilleFeatureFlag.isLentilleListEnabled`) l'alimente à chaque
/// réaffectation de la liste — REST initial ET rechargements déclenchés par
/// le socket (`ConversationSyncEngine.handleUnreadUpdated` recopie déjà
/// `event.bridge` sur la conversation en cache, G-124 — voir son
/// commentaire). Garde source LWS-2bis inchangée : aucun fichier de peau
/// (`Lentille/Row`, `Lentille/Mode`, `Lentille/Chrome`) ne nomme ce type.
final class GatewayBridgeProvider: ConversationBridgeProviding, @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private let lock = NSLock()
    private var bridges: [String: ConversationBridge] = [:]

    init() {}

    func bridgeFor(conversationId: String, viewerId: String, unreadCount: Int) async -> ConversationBridge? {
        // `lock()`/`unlock()` sont `noasync` (SE-0340) : dans cette méthode
        // `async`, seuls `withLock` (closure synchrone, aucune suspension
        // possible verrou tenu) passe la compile Swift 6 / Xcode 26.
        lock.withLock { bridges[conversationId] }
    }

    /// Enregistre (`bridge` non nil) ou efface (`nil`) le pont connu pour une
    /// conversation. `nil` n'est jamais un no-op silencieux : un pont
    /// PRÉCÉDEMMENT connu qui redevient absent (ex. `unreadCount` retombé à
    /// zéro, contrat §3.2) doit disparaître du registre — le conserver serait
    /// exactement la donnée fabriquée que ce fichier proscrit partout
    /// ailleurs.
    func note(_ bridge: ConversationBridge?, for conversationId: String) {
        lock.withLock {
            if let bridge {
                bridges[conversationId] = bridge
            } else {
                bridges.removeValue(forKey: conversationId)
            }
        }
    }

    /// Alimentation en lot depuis un instantané de liste — même donnée que
    /// celle déjà posée sur `MeeshyConversation.bridge` par le décodage SDK
    /// (REST) ou par `ConversationSyncEngine.handleUnreadUpdated` (socket) :
    /// ce provider ne fait que la recopier dans son registre, jamais ne la
    /// recalcule. `bridge == nil` EFFACE l'entrée (délègue à `note`, même
    /// règle) — un instantané où la conversation n'a plus de pont (ex.
    /// `unreadCount` retombé à zéro) doit purger le registre, pas laisser un
    /// pont périmé derrière. Une conversation absente de `conversations`
    /// TOUT COURT (supprimée, filtrée) n'est en revanche pas purgée par ce
    /// passage : ce cas n'a jamais été observé par ce provider, il n'a rien
    /// à en conclure.
    func noteBridges(from conversations: [MeeshyConversation]) {
        for conversation in conversations {
            note(conversation.bridge, for: conversation.id)
        }
    }
}
