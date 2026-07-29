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

    /// Contrat partagé avec `SharePendingSend` (cible MeeshyShareExtension).
    /// Les deux cibles ne peuvent pas partager un type — l'extension est
    /// délibérément sans dépendance SDK — donc le contrat est dupliqué et
    /// `SharePendingSendContractTests` vérifie que les miroirs s'accordent.
    /// `nonisolated` sur chacun de ces membres : la classe est `@MainActor`,
    /// or le contrat doit être lisible depuis un contexte nonisolated — c'est
    /// précisément ce que fait `SharePendingSendContractTests`, qui compare ce
    /// miroir à celui de l'extension.
    nonisolated static let appGroupIdentifier = "group.me.meeshy.apps"
    nonisolated static let directoryName = "share_pending_sends"

    nonisolated struct PendingSend: Codable, Equatable {
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

    nonisolated static func directoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
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

            guard let pending = try? Self.decoder().decode(PendingSend.self, from: data) else {
                // Un payload corrompu ne redeviendra jamais lisible : le garder
                // ferait relire le même déchet à chaque lancement.
                remove(url, reason: "relais corrompu")
                continue
            }

            do {
                try await queue.enqueue(makeItem(from: pending))
                remove(url, reason: "relais enfilé")
            } catch {
                // Fichier CONSERVÉ : c'est ce qui rend la reprise réessayable.
                logger.error(
                    "Enfilement du relais \(pending.clientMessageId, privacy: .public) échoué, conservé pour réessai : \(error.localizedDescription, privacy: .public)"
                )
            }
        }
    }

    /// Le `clientMessageId` forgé par l'extension est repris À L'IDENTIQUE :
    /// c'est lui qui garantit qu'un POST ayant abouti sans que sa réponse
    /// parvienne ne produira pas un doublon au rejeu (dédoublonnage gateway par
    /// index unique). `createdAt` est préservé pour ne pas antidater le partage.
    private func makeItem(from pending: PendingSend) -> OfflineQueueItem {
        OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: pending.clientMessageId,
            conversationId: pending.conversationId,
            content: pending.content,
            originalLanguage: nil,
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil,
            localAudioPath: nil,
            createdAt: pending.createdAt
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
