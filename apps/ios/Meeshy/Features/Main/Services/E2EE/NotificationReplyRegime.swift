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
        /// La passerelle refuse pour de bon, enveloppe et code à l'appui (plus
        /// membre, conversation supprimée) : la réponse ne partira jamais
        /// (#14673, #14693).
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

    /// Un refus SERVI par la passerelle, et qui ne changera pas en
    /// réessayant : conversation introuvable (inexistante, supprimée, ou dont
    /// on n'est plus membre : la passerelle sert le même 404) ou accès refusé.
    /// Le statut seul ne suffit pas (#14693) : Traefik sert un 404 sans
    /// enveloppe pendant un déploiement, un proxy d'entreprise un 403. Seuls
    /// l'enveloppe de la passerelle (`success: false`, exigée sur les DEUX
    /// formes d'erreur, #14708) et son code décident ; tout autre refus, une
    /// session expirée, un délai ou un 5xx restent transitoires.
    nonisolated static func isDefinitive(_ error: any Error) -> Bool {
        gatewayRefusalCode(of: error).map(definitiveRefusalCodes.contains) ?? false
    }

    nonisolated private static func gatewayRefusalCode(of error: any Error) -> String? {
        switch error {
        case MeeshyError.rejected(let rejection)
            where rejection.isGatewayEnvelope && definitiveStatuses.contains(rejection.statusCode):
            return rejection.code
        case MeeshyError.forbidden(_, let body):
            return APIRejection.gatewayRefusal(statusCode: 403, body: body)?.code
        default:
            return nil
        }
    }

    nonisolated private static let definitiveStatuses: Set<Int> = [403, 404, 410]
    /// Les codes que `GET /conversations/:id` sert pour une conversation qu'il
    /// ne sert plus (`refuserCommeIntrouvable`, `CODE_NON_MEMBRE` de
    /// `services/gateway/src/routes/conversations/utils/access-control.ts`).
    nonisolated private static let definitiveRefusalCodes: Set<String> = [
        "CONVERSATION_NOT_FOUND", "CONVERSATION_ACCESS_DENIED",
    ]

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

    /// Une fiche telle que le FICHIER l'a écrite : toujours datée. Sans date,
    /// elle n'est pas intacte — la tolérance de `init(from:)` ne vaut que pour
    /// les préférences d'avant #14673.
    init(storedFrom decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard container.contains(.createdAt) else {
            throw DecodingError.keyNotFound(CodingKeys.createdAt, .init(codingPath: decoder.codingPath, debugDescription: "undated"))
        }
        try self.init(from: decoder)
    }

    /// Une fiche dont le fichier ne dit plus que l'IDENTITÉ (#14707) : un champ
    /// ne se décode plus (corruption, format d'une version future). Son âge
    /// est inconnu, elle est donc échue : elle ne part jamais, l'utilisateur
    /// lit qu'elle n'est pas partie, et son clair quitte le coffre au retour
    /// de son compte — le chemin de toute fiche de plus de 24 h.
    init(identityFrom decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        clientMessageId = try container.decode(String.self, forKey: .clientMessageId)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        senderId = try container.decode(String.self, forKey: .senderId)
        replyToId = nil
        originalLanguage = nil
        createdAt = .distantPast
        withdrawnAt = try? container.decodeIfPresent(Date.self, forKey: .withdrawnAt)
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
///
/// **Un fichier qui existe mais ne se lit pas n'est jamais écrasé** (#14694) :
/// avant le premier déverrouillage (protection `completeUntilFirstUserAuthentication`),
/// il garde des fiches dont le clair attend au coffre. Le magasin tient alors
/// ses fiches en mémoire, n'écrit rien, et relit le fichier à chaque accès :
/// relu, il rejoint la mémoire et s'écrit de nouveau.
///
/// **Un fichier LU mais indécodable part à côté, et le magasin guérit**
/// (#14707) : ses octets sont gardés à l'identique sous
/// `awaiting-regime.corrupt-<ms>.json` (même protection, hors sauvegarde),
/// chaque fiche qui se décode encore est rendue, chaque fiche dont seule
/// l'identité se lit revient ÉCHUE (`init(identityFrom:)`), et l'écriture
/// reprend. Faute de pouvoir le déplacer, il est traité comme verrouillé. La clé
/// héritée des préférences ne part qu'une fois le fichier ÉCRIT, et une fiche
/// migrée y garde la date de sa première lecture, sans quoi la borne de 24 h
/// reculerait à chaque lancement.
@MainActor
final class NotificationRepliesAwaitingRegime: NotificationRepliesAwaitingRegimeStoring {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = NotificationRepliesAwaitingRegime(fileURL: defaultFileURL, legacyDefaults: .standard)
    /// La clé des préférences sauvegardées, où vivaient les fiches avant #14673.
    static let legacyKey = "meeshy.notificationReply.awaitingRegime"
    private let fileURL: URL?
    private let legacyDefaults: UserDefaults?
    private var legacyIds: Set<String>
    private var held: [NotificationReplyAwaitingRegime]
    private var fileUnreadable: Bool

    var awaiting: [NotificationReplyAwaitingRegime] {
        recoverOnceReadable()
        return held
    }

    init(fileURL: URL?, legacyDefaults: UserDefaults? = nil) {
        self.fileURL = fileURL
        self.legacyDefaults = legacyDefaults
        let legacy = legacyDefaults?.data(forKey: Self.legacyKey).flatMap(Self.decode) ?? []
        let reading = Self.load(fileURL)
        let stored = reading ?? []
        legacyIds = Set(legacy.map(\.clientMessageId)).subtracting(stored.map(\.clientMessageId))
        fileUnreadable = reading == nil
        held = Self.merge(stored, over: legacy)
        if fileUnreadable {
            Logger.e2ee.error("notification replies awaiting regime: file unreadable, kept untouched")
        }
        persist()
    }

    func add(_ reply: NotificationReplyAwaitingRegime) {
        recoverOnceReadable()
        held = held.filter { $0.clientMessageId != reply.clientMessageId } + [reply]
        persist()
    }

    func remove(_ clientMessageId: String) {
        recoverOnceReadable()
        held = held.filter { $0.clientMessageId != clientMessageId }
        persist()
    }

    func withdraw(_ clientMessageId: String, at date: Date) {
        recoverOnceReadable()
        held = held.map { reply in
            guard reply.clientMessageId == clientMessageId, reply.withdrawnAt == nil else { return reply }
            var withdrawn = reply
            withdrawn.withdrawnAt = date
            return withdrawn
        }
        persist()
    }

    private func recoverOnceReadable() {
        guard fileUnreadable, let stored = Self.load(fileURL) else { return }
        fileUnreadable = false
        held = Self.merge(held, over: stored)
        persist()
    }

    /// Le fichier d'abord ; la clé héritée ne part qu'après lui. Faute de
    /// fichier écrit, elle garde les fiches migrées, datées.
    private func persist() {
        guard !fileUnreadable, write(held) else {
            keepLegacy()
            return
        }
        legacyIds = []
        legacyDefaults?.removeObject(forKey: Self.legacyKey)
    }

    private func keepLegacy() {
        guard let legacyDefaults, !legacyIds.isEmpty else { return }
        let migrated = held.filter { legacyIds.contains($0.clientMessageId) }
        guard !migrated.isEmpty, let data = try? JSONEncoder().encode(migrated) else {
            legacyIds = []
            legacyDefaults.removeObject(forKey: Self.legacyKey)
            return
        }
        legacyDefaults.set(data, forKey: Self.legacyKey)
    }

    private func write(_ replies: [NotificationReplyAwaitingRegime]) -> Bool {
        guard let fileURL, let data = try? JSONEncoder().encode(replies) else { return false }
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var excluded = URLResourceValues()
            excluded.isExcludedFromBackup = true
            var url = fileURL
            try url.setResourceValues(excluded)
            return true
        } catch {
            Logger.e2ee.error("notification replies awaiting regime not saved: \(String(describing: type(of: error)), privacy: .public)")
            return false
        }
    }

    /// `[]` pour un fichier absent ; `nil` pour un fichier qui ne se LIT pas,
    /// ou dont les octets indécodables n'ont pas pu être mis de côté.
    private static func load(_ fileURL: URL?) -> [NotificationReplyAwaitingRegime]? {
        guard let fileURL, FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        let elements = try? JSONDecoder().decode([SalvagedFiche].self, from: data)
        if let elements, elements.allSatisfy(\.isIntact) { return elements.compactMap(\.fiche) }
        guard setAside(fileURL) else { return nil }
        let salvaged = (elements ?? []).compactMap(\.fiche)
        Logger.e2ee.error("notification replies awaiting regime: undecodable file set aside, fiches=\(salvaged.count, privacy: .public) of=\(elements?.count ?? -1, privacy: .public)")
        return salvaged
    }

    /// Les octets partent à côté, à l'identique ; le nom suivant est libre.
    private static func setAside(_ fileURL: URL) -> Bool {
        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        var aside = fileURL.deletingPathExtension()
            .appendingPathExtension("corrupt-\(stamp)")
            .appendingPathExtension(fileURL.pathExtension)
        do {
            try FileManager.default.moveItem(at: fileURL, to: aside)
            var excluded = URLResourceValues()
            excluded.isExcludedFromBackup = true
            try? aside.setResourceValues(excluded)
            return true
        } catch {
            Logger.e2ee.error("notification replies awaiting regime: undecodable file not set aside, kept untouched")
            return false
        }
    }

    /// Un élément du tableau, décodé SEUL : une fiche invalide n'emporte pas
    /// les autres, et son identité, si elle se lit, survit.
    private struct SalvagedFiche: Decodable {
        let fiche: NotificationReplyAwaitingRegime?
        let isIntact: Bool

        init(from decoder: any Decoder) throws {
            if let fiche = try? NotificationReplyAwaitingRegime(storedFrom: decoder) {
                self.fiche = fiche
                isIntact = true
                return
            }
            fiche = try? NotificationReplyAwaitingRegime(identityFrom: decoder)
            isIntact = false
        }
    }

    /// Les fiches de `base`, puis celles de `newer` qu'elle n'a pas : à
    /// identifiant égal, `newer` l'emporte.
    private static func merge(
        _ newer: [NotificationReplyAwaitingRegime], over base: [NotificationReplyAwaitingRegime]
    ) -> [NotificationReplyAwaitingRegime] {
        let newerIds = Set(newer.map(\.clientMessageId))
        return base.filter { !newerIds.contains($0.clientMessageId) } + newer
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
