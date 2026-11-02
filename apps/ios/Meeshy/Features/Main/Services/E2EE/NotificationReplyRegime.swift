import Foundation
import MeeshySDK
import os

/// **Le régime d'une réponse rapide se CONFIRME avant tout clair** (#13165,
/// suivi de #13067, règle fail-closed #9229, bout en bout irréversible #12949).
///
/// La garde du régime (`EndToEndDestinationGuard`) lit ce que CET appareil a
/// vu : sa mémoire, la ligne de la liste, le fil en cache. Une conversation
/// passée chiffrée de bout en bout sur un AUTRE appareil pendant que celui-ci
/// dormait n'y est pas : la réponse depuis la bannière posait alors une ligne,
/// une entrée d'outbox et une requête en clair, que la passerelle refusait
/// trop tard.
///
/// Trois sources, dans l'ordre, et une seule qui dit le bout en bout scelle :
/// 1. la garde, nourrie du mode que porte le push (`conversationEncryptionMode`,
///    ou `encryptionMode`) : il ne peut qu'AJOUTER le bout en bout, car il date
///    de l'envoi du message et la conversation a pu basculer depuis ;
/// 2. le mode relu de la passerelle juste avant l'envoi, borné dans le temps :
///    seul lui peut dire le clair ;
/// 3. faute de relecture (hors ligne, délai, erreur), le régime n'est PAS
///    confirmé : le clair attend au coffre, sans ligne ni outbox ni réseau,
///    que le régime se relise (`NotificationReplyAwaitingRegime`, #14667).
///
/// Modèle de menace : serveur honnête, appareil en retard sur le régime ;
/// serveur qui sert sans mode une conversation vue chiffrée (la garde). Hors
/// modèle : la bascule qui survient entre la relecture et la requête (la
/// passerelle refuse alors le clair, `E2EE_PLAINTEXT_REFUSED`), et un serveur
/// malveillant qui ment sur le mode d'une conversation que l'appareil n'a
/// jamais vue chiffrée (#12520).
struct NotificationReplyRegime {
    enum Destination: Equatable {
        /// La passerelle vient de servir un régime où elle lit le message.
        case readableByServer
        /// Une source dit le bout en bout : le clair ne quitte pas le coffre.
        case endToEnd
        /// Le régime n'a pas pu être relu : la réponse attend sa confirmation.
        case unconfirmed
    }

    /// Les clés du push qui portent le mode : celle de la conversation, et
    /// celle du message, qui ne peut dire `e2ee` que dans une conversation
    /// chiffrée de bout en bout.
    static let pushedModeKeys = ["conversationEncryptionMode", "encryptionMode"]

    let destinationGuard: EndToEndDestinationGuard
    let servedMode: @MainActor (String) async throws -> String?
    var limit: Duration = .seconds(6)

    /// Les modes portés par le push. Une valeur qui n'est pas une chaîne se lit
    /// comme un mode inconnu, donc comme le bout en bout.
    static func pushedModes(_ userInfo: [AnyHashable: Any]) -> [String?] {
        pushedModeKeys.compactMap { key -> String? in
            guard let value = userInfo[key], !(value is NSNull) else { return nil }
            return value as? String ?? unreadableMode
        }
    }

    private static let unreadableMode = "unreadable"

    @MainActor
    func destination(of conversationId: String, userInfo: [AnyHashable: Any]) async -> Destination {
        if await destinationGuard.seals(conversationId, served: Self.pushedModes(userInfo)) { return .endToEnd }
        guard let served = await freshlyServedMode(of: conversationId) else {
            Logger.e2ee.warning("notification reply: regime not confirmed by the gateway, kept off the network")
            return .unconfirmed
        }
        return await destinationGuard.seals(conversationId, served: [served.mode]) ? .endToEnd : .readableByServer
    }

    @MainActor
    private func freshlyServedMode(of conversationId: String) async -> ServedMode? {
        let slot = OSAllocatedUnfairLock<ServedMode?>(initialState: nil)
        let read = servedMode
        let fetch = Task { @MainActor in
            do {
                let served = ServedMode(mode: try await read(conversationId))
                slot.withLock { $0 = served }
            } catch {}
        }
        await BoundedWait.first(of: fetch, orAfter: limit)
        fetch.cancel()
        return slot.withLock { $0 }
    }

    private struct ServedMode: Sendable {
        let mode: String?
    }
}

/// **Une réponse dont le régime n'est pas confirmé ATTEND sa confirmation**
/// (#14667, suivi de #13165).
///
/// Hors ligne, la relecture échoue : la conversation peut être en clair comme
/// chiffrée de bout en bout. Le clair va au coffre sous l'identifiant client,
/// et aucune ligne ne s'écrit — une bulle `e2ee` scellerait le fil d'une
/// conversation en clair (`EndToEndRegimeLedger.seals(trail:)`). Cette fiche
/// ne garde que ce qui range la réponse, jamais son texte. Au retour du
/// réseau, le régime relu décide : le clair rejoint l'outbox, ou la bulle
/// scellée en échec naît, comme pour une conversation connue chiffrée.
struct NotificationReplyAwaitingRegime: Codable, Equatable, Sendable {
    let clientMessageId: String
    let conversationId: String
    let senderId: String
    let replyToId: String?
    let originalLanguage: String?

    init(_ item: OfflineQueueItem, senderId: String) {
        clientMessageId = item.clientMessageId
        conversationId = item.conversationId
        self.senderId = senderId
        replyToId = item.replyToId
        originalLanguage = item.originalLanguage
    }

    /// La réponse telle que le geste l'avait composée, avec le texte relu au coffre.
    func queueItem(content: String) -> OfflineQueueItem {
        OfflineQueueItem(
            conversationId: conversationId, content: content, clientMessageId: clientMessageId,
            originalLanguage: originalLanguage, replyToId: replyToId
        )
    }
}

/// Les réponses en attente de leur régime, sur cet appareil.
@MainActor
protocol NotificationRepliesAwaitingRegimeStoring: AnyObject {
    var awaiting: [NotificationReplyAwaitingRegime] { get }
    func add(_ reply: NotificationReplyAwaitingRegime)
    func remove(_ clientMessageId: String)
}

/// Les fiches vivent dans les préférences (aucun texte) ; `defaults: nil`
/// les garde en mémoire seulement.
@MainActor
final class NotificationRepliesAwaitingRegime: NotificationRepliesAwaitingRegimeStoring {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = NotificationRepliesAwaitingRegime()
    private static let key = "meeshy.notificationReply.awaitingRegime"
    private let defaults: UserDefaults?
    private(set) var awaiting: [NotificationReplyAwaitingRegime]

    init(defaults: UserDefaults? = .standard) {
        self.defaults = defaults
        awaiting = defaults?.data(forKey: Self.key)
            .flatMap { try? JSONDecoder().decode([NotificationReplyAwaitingRegime].self, from: $0) } ?? []
    }

    func add(_ reply: NotificationReplyAwaitingRegime) {
        save(awaiting.filter { $0.clientMessageId != reply.clientMessageId } + [reply])
    }

    func remove(_ clientMessageId: String) {
        save(awaiting.filter { $0.clientMessageId != clientMessageId })
    }

    private func save(_ replies: [NotificationReplyAwaitingRegime]) {
        awaiting = replies
        defaults?.set(try? JSONEncoder().encode(replies), forKey: Self.key)
    }
}
