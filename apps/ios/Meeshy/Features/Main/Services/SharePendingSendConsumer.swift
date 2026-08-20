import Foundation
import MeeshySDK
import os

/// Verse dans l'`OfflineQueue` les partages que l'extension n'a pas pu envoyer.
///
/// L'extension de partage tourne sans SDK : elle ne peut pas atteindre l'outbox
/// GRDB. Quand un envoi échoue (hors-ligne, jeton périmé, gateway indisponible)
/// elle dépose un relais dans le conteneur App Group ; ce consommateur le
/// reprend au réveil de l'app et le confie à la vraie file, qui le rejoue.
///
/// Décalque de `NSEPendingMessageConsumer`, y compris son invariant central :
/// **la suppression du fichier suit le commit, jamais l'inverse**. Un échec
/// transitoire laisse le relais sur disque pour la tentative suivante.
@MainActor
final class SharePendingSendConsumer {
    static let shared = SharePendingSendConsumer()

    /// Contrat partagé avec `SharePendingShare` (cible MeeshyShareExtension).
    /// Les deux cibles ne peuvent pas partager un type — l'extension est
    /// délibérément sans dépendance SDK — donc le contrat est dupliqué et
    /// `SharePendingSendContractTests` vérifie que les miroirs s'accordent,
    /// **états par cible compris**.
    ///
    /// `nonisolated` sur chacun de ces membres : la classe est `@MainActor`,
    /// or le contrat doit être lisible depuis un contexte nonisolated — c'est
    /// précisément ce que fait le test de contrat.
    nonisolated static let appGroupIdentifier = "group.me.meeshy.apps"
    nonisolated static let directoryName = "share_pending_sends"
    nonisolated static let mediaDirectoryName = "share_pending_media"
    nonisolated static let currentVersion = 1

    nonisolated struct PendingMedia: Codable, Equatable {
        let relPath: String
        let ext: String
        let mime: String
        let bytes: Int
    }

    nonisolated enum PendingTargetState: String, Codable, Equatable {
        case pending
        case sent
        case failed
    }

    nonisolated struct PendingTarget: Codable, Equatable {
        let conversationId: String
        var state: PendingTargetState
        var serverMessageId: String?
    }

    nonisolated struct PendingShare: Codable, Equatable {
        let v: Int
        let clientMessageId: String
        let createdAt: Date
        let content: String?
        var media: [PendingMedia]
        var uploadedAttachmentIds: [String]?
        var targets: [PendingTarget]
        var originTargetIndex: Int?

        var isFullyServed: Bool { targets.allSatisfy { $0.state == .sent } }
        var fileName: String { "\(clientMessageId).json" }
    }

    /// Le relais de l'ANCIEN format, encore possible sur le disque d'un
    /// utilisateur qui met à jour l'app avec un partage différé en attente.
    private nonisolated struct LegacyPendingSend: Decodable {
        let clientMessageId: String
        let conversationId: String
        let content: String
        let createdAt: Date
    }

    nonisolated static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    nonisolated static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    nonisolated static func directoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    nonisolated static func mediaDirectoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(mediaDirectoryName, isDirectory: true)
    }

    /// L'identifiant de la fiche reste la clé de reprise ; chaque cible reçoit
    /// un identifiant DÉRIVÉ, stable. Miroir EXACT de
    /// `SharePendingShare.derivedClientMessageId` — une divergence produirait
    /// un doublon serveur au lieu d'un dédoublonnage.
    nonisolated static func derivedClientMessageId(shareId: String, targetIndex: Int) -> String {
        "\(shareId)_t\(targetIndex)"
    }

    /// Décode une fiche v:1 ; à défaut, tente l'ancien format et le PROMEUT en
    /// fiche à une cible. Une version inconnue n'est jamais devinée.
    nonisolated static func decodeRelay(_ data: Data) -> PendingShare? {
        if let share = try? decoder().decode(PendingShare.self, from: data) {
            return share.v == currentVersion ? share : nil
        }
        guard let legacy = try? decoder().decode(LegacyPendingSend.self, from: data) else {
            return nil
        }
        return PendingShare(
            v: currentVersion,
            clientMessageId: legacy.clientMessageId,
            createdAt: legacy.createdAt,
            content: legacy.content,
            media: [],
            uploadedAttachmentIds: nil,
            targets: [PendingTarget(
                conversationId: legacy.conversationId, state: .pending, serverMessageId: nil)],
            originTargetIndex: nil
        )
    }

    /// Miroir EXACT de `SharePendingShare.commit(in:)` : écriture atomique
    /// tant qu'une cible reste à servir, suppression seulement quand toutes le
    /// sont. Les deux invariants vivent ici, et nulle part ailleurs.
    nonisolated static func commit(_ share: PendingShare, in directory: URL) throws {
        let file = directory.appendingPathComponent(share.fileName)
        guard !share.isFullyServed else {
            if FileManager.default.fileExists(atPath: file.path) {
                try FileManager.default.removeItem(at: file)
            }
            return
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try encoder().encode(share).write(to: file, options: .atomic)
    }

    private let queue: OfflineMessageQueueing
    private let logger = Logger(subsystem: "me.meeshy.app", category: "share-consumer")

    init(queue: OfflineMessageQueueing = OfflineQueue.shared) {
        self.queue = queue
    }

    func consumeAll(in directory: URL? = SharePendingSendConsumer.directoryURL()) async {
        guard let directory else { return }
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        ) else { return }

        let relays = files.filter { $0.pathExtension == "json" }
        guard !relays.isEmpty else { return }

        logger.info("Reprise de \(relays.count, privacy: .public) partage(s) différé(s)")

        for url in relays {
            guard let data = try? Data(contentsOf: url) else {
                logger.error("Relais illisible sur disque : \(url.lastPathComponent, privacy: .public)")
                continue
            }

            guard let share = Self.decodeRelay(data) else {
                // Un payload corrompu ne redeviendra jamais lisible : le garder
                // ferait relire le même déchet à chaque lancement.
                remove(url, reason: "relais corrompu")
                continue
            }

            do {
                for (index, target) in share.targets.enumerated() where target.state != .sent {
                    try await queue.enqueue(makeItem(from: share, targetIndex: index, target: target))
                }
                remove(url, reason: "relais enfilé")
            } catch {
                // Fichier CONSERVÉ : c'est ce qui rend la reprise réessayable.
                logger.error(
                    "Enfilement du relais \(share.clientMessageId, privacy: .public) échoué, conservé pour réessai : \(error.localizedDescription, privacy: .public)"
                )
            }
        }
    }

    /// `createdAt` est préservé pour ne pas antidater le partage. Le
    /// `clientMessageId` est DÉRIVÉ par cible : c'est lui qui garantit qu'un
    /// POST ayant abouti sans que sa réponse parvienne ne produira pas un
    /// doublon au rejeu (dédoublonnage gateway par index unique).
    private func makeItem(
        from share: PendingShare,
        targetIndex: Int,
        target: PendingTarget
    ) -> OfflineQueueItem {
        OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: Self.derivedClientMessageId(
                shareId: share.clientMessageId, targetIndex: targetIndex),
            conversationId: target.conversationId,
            content: share.content ?? "",
            originalLanguage: nil,
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: share.uploadedAttachmentIds,
            localAudioPath: nil,
            createdAt: share.createdAt
        )
    }

    private func remove(_ url: URL, reason: String) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            logger.error(
                "Suppression du relais (\(reason, privacy: .public)) échouée : \(error.localizedDescription, privacy: .public)"
            )
        }
    }
}
