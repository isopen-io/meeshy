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
        /// La passerelle refuse pour de bon (403, 404, 410 : plus membre,
        /// conversation supprimée) : la réponse ne partira jamais (#14673).
        case inaccessible
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
        switch await freshlyServedMode(of: conversationId) {
        case nil:
            Logger.e2ee.warning("notification reply: regime not confirmed by the gateway, kept off the network")
            return .unconfirmed
        case .refused?:
            Logger.e2ee.warning("notification reply: the gateway no longer serves the conversation")
            return .inaccessible
        case .served(let mode)?:
            return await destinationGuard.seals(conversationId, served: [mode]) ? .endToEnd : .readableByServer
        }
    }

    @MainActor
    private func freshlyServedMode(of conversationId: String) async -> Reading? {
        let slot = OSAllocatedUnfairLock<Reading?>(initialState: nil)
        let read = servedMode
        let fetch = Task { @MainActor in
            do {
                let served = Reading.served(try await read(conversationId))
                slot.withLock { $0 = served }
            } catch where Self.isDefinitive(error) {
                slot.withLock { $0 = .refused }
            } catch {}
        }
        await BoundedWait.first(of: fetch, orAfter: limit)
        fetch.cancel()
        return slot.withLock { $0 }
    }

    /// Un refus qui ne changera pas en réessayant : plus membre (403, ou 404
    /// que la passerelle sert pour ne pas dire qu'elle existe), conversation
    /// supprimée (404, 410). Une session expirée (401), un délai ou un 5xx
    /// restent transitoires.
    nonisolated static func isDefinitive(_ error: any Error) -> Bool {
        switch error {
        case MeeshyError.forbidden:
            return true
        case MeeshyError.server(let status, _):
            return definitiveStatuses.contains(status)
        case APIError.serverError(let status, _):
            return definitiveStatuses.contains(status)
        default:
            return false
        }
    }

    nonisolated private static let definitiveStatuses: Set<Int> = [403, 404, 410]

    private enum Reading: Sendable {
        case served(String?)
        case refused
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
    /// Le geste : au-delà de `NotificationReplyRegimeWait.maxAge`, la réponse
    /// ne part plus (#14673).
    let createdAt: Date
    /// Retirée (compte déconnecté, échue, refusée) : elle ne partira jamais,
    /// et la fiche ne reste que le temps d'effacer son clair d'un coffre fermé.
    var withdrawnAt: Date?

    init(_ item: OfflineQueueItem, senderId: String, createdAt: Date = Date()) {
        clientMessageId = item.clientMessageId
        conversationId = item.conversationId
        self.senderId = senderId
        replyToId = item.replyToId
        originalLanguage = item.originalLanguage
        self.createdAt = createdAt
        withdrawnAt = nil
    }

    /// Une fiche écrite avant #14673 n'a pas de date : elle prend celle de sa
    /// première lecture, que le magasin réécrit aussitôt.
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        clientMessageId = try container.decode(String.self, forKey: .clientMessageId)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        senderId = try container.decode(String.self, forKey: .senderId)
        replyToId = try container.decodeIfPresent(String.self, forKey: .replyToId)
        originalLanguage = try container.decodeIfPresent(String.self, forKey: .originalLanguage)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        withdrawnAt = try container.decodeIfPresent(Date.self, forKey: .withdrawnAt)
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
    func withdraw(_ clientMessageId: String, at date: Date)
}

/// Les fiches (aucun texte) vivent dans un fichier HORS de la sauvegarde
/// iCloud ou Finder (#14673) : identifiants de conversation et de message cité
/// n'ont rien à faire dans une copie qui survit à l'appareil. `fileURL: nil`
/// les garde en mémoire seulement.
@MainActor
final class NotificationRepliesAwaitingRegime: NotificationRepliesAwaitingRegimeStoring {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = NotificationRepliesAwaitingRegime(fileURL: defaultFileURL, legacyDefaults: .standard)
    /// La clé des préférences sauvegardées, où vivaient les fiches avant #14673.
    static let legacyKey = "meeshy.notificationReply.awaitingRegime"
    private let fileURL: URL?
    private(set) var awaiting: [NotificationReplyAwaitingRegime]

    init(fileURL: URL?, legacyDefaults: UserDefaults? = nil) {
        self.fileURL = fileURL
        let legacy = legacyDefaults?.data(forKey: Self.legacyKey).flatMap(Self.decode) ?? []
        let stored = fileURL.flatMap { try? Data(contentsOf: $0) }.flatMap(Self.decode) ?? []
        awaiting = stored + legacy.filter { old in !stored.contains { $0.clientMessageId == old.clientMessageId } }
        save(awaiting)
        legacyDefaults?.removeObject(forKey: Self.legacyKey)
    }

    func add(_ reply: NotificationReplyAwaitingRegime) {
        save(awaiting.filter { $0.clientMessageId != reply.clientMessageId } + [reply])
    }

    func remove(_ clientMessageId: String) {
        save(awaiting.filter { $0.clientMessageId != clientMessageId })
    }

    func withdraw(_ clientMessageId: String, at date: Date) {
        save(awaiting.map { reply in
            guard reply.clientMessageId == clientMessageId, reply.withdrawnAt == nil else { return reply }
            var withdrawn = reply
            withdrawn.withdrawnAt = date
            return withdrawn
        })
    }

    private func save(_ replies: [NotificationReplyAwaitingRegime]) {
        awaiting = replies
        guard let fileURL, let data = try? JSONEncoder().encode(replies) else { return }
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var excluded = URLResourceValues()
            excluded.isExcludedFromBackup = true
            var url = fileURL
            try url.setResourceValues(excluded)
        } catch {
            Logger.e2ee.error("notification replies awaiting regime not saved: \(String(describing: type(of: error)), privacy: .public)")
        }
    }

    private static func decode(_ data: Data) -> [NotificationReplyAwaitingRegime]? {
        try? JSONDecoder().decode([NotificationReplyAwaitingRegime].self, from: data)
    }

    private static var defaultFileURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("NotificationReplies", isDirectory: true)
            .appendingPathComponent("awaiting-regime.json")
    }
}
