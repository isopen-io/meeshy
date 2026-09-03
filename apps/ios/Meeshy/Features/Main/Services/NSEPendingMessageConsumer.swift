import Foundation
import MeeshySDK
import os

@MainActor
final class NSEPendingMessageConsumer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = NSEPendingMessageConsumer()

    private nonisolated static let appGroupId = "group.me.meeshy.apps"
    private nonisolated static let pendingDirName = "nse_pending_messages"
    private let logger = Logger(subsystem: "me.meeshy.app", category: "nse-consumer")

    /// Dossier de staging App Group — exposé pour le wipe de logout
    /// (appgroup-01), miroir de `SharePendingSendConsumer.directoryURL()`.
    nonisolated static func directoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent(pendingDirName, isDirectory: true)
    }

    private init() {}

    /// Un blob pré-récupéré, LU ET DÉCODÉ hors du fil principal.
    ///
    /// `nonisolated` EXPLICITE : la classe hôte est isolée au MainActor, et un
    /// type imbriqué en hérite (SE-0466) — or cette valeur naît dans une tâche
    /// DÉTACHÉE. Rien de son calcul n'a besoin du MainActor.
    nonisolated struct DecodedPending: Sendable {
        let conversationId: String
        let url: URL
        let message: APIMessage
    }

    func consumeAll() async {
        // Lecture du conteneur App Group + décodage JSON HORS du MainActor.
        //
        // Le corps de cette méthode est isolé MainActor, et sous SE-0461
        // (`nonisolated(nonsending)` par défaut, activé au projet) une méthode
        // `async` appelée depuis le MainActor y exécute son corps — `async let`
        // ou non. La lecture disque et le `JSONDecoder.decode` de CHAQUE fichier
        // restaient donc sur la boucle principale, juste avant la première
        // lecture GRDB de l'ouverture : après une rafale de notifications,
        // l'ouverture bloquait le rendu pendant tout le drain. Seul un
        // `Task.detached` quitte réellement l'acteur.
        let (decoded, corrupt) = await Self.readAndDecodePending()
        guard !decoded.isEmpty || !corrupt.isEmpty else { return }

        // Charges illisibles : on les retire pour ne pas les relire à chaque
        // lancement. Le retrait reste ici — il journalise, et le journal porte
        // l'identité de l'instance.
        let fm = FileManager.default
        for url in corrupt {
            logger.error("NSE prefetch decode failed — dropping \(url.lastPathComponent, privacy: .public)")
            do { try fm.removeItem(at: url) } catch {
                logger.error("NSE prefetch file removal failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        guard !decoded.isEmpty else { return }

        logger.info("Consuming \(decoded.count) NSE-prefetched messages")

        let user = AuthManager.shared.currentUser
        let userId = user?.id ?? ""
        let username = user?.username
        // Une seule construction pour tout le lot : `preferredContentLanguages`
        // est CALCULÉE et alloue un tableau à chaque lecture. Dans la boucle,
        // elle se payait une fois par message pré-récupéré — sur le fil
        // principal, avant la première bulle.
        let prism = user?.preferredContentLanguages ?? []
        // Ce que GRDB GRAVE dans `replyToJson` descend le prisme STRICT du
        // lecteur (`ReaderPrism`) — la descente de la bulle et des deux autres
        // chemins d'ingestion, REST et socket — jamais la liste à repli « fr » :
        // deux prismes graveraient deux citations pour un même message.
        let engravingPrism = ReaderPrism.resolve(for: user)

        var decodedAPIMessages: [APIMessage] = []
        var consumedFiles: [URL] = []
        for item in decoded {
            let apiMsg = item.message
            decodedAPIMessages.append(apiMsg)
            consumedFiles.append(item.url)
            let message = apiMsg.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: prism)

            await CacheCoordinator.shared.messages.upsert(
                item: message,
                for: item.conversationId
            ) { existing, newItem in
                guard !existing.contains(where: { $0.id == newItem.id }) else { return existing }
                return (existing + [newItem]).sorted { $0.createdAt < $1.createdAt }
            }
        }

        // The CacheCoordinator upsert above only feeds the conversation LIST
        // (preview, ordering). The conversation timeline reads GRDB — persist
        // there too, or a push-prefetched message stays invisible inside the
        // conversation until the next REST revalidation.
        //
        // Use the AWAITED `upsertFromAPIMessages` (commits before returning),
        // not the fire-and-forget `bufferIncomingAPIMessages` (yields onto an
        // async write worker). The conversation-open path calls `consumeAll`
        // right before reading its GRDB snapshot: only an awaited commit
        // guarantees the just-consumed push message is in that snapshot, so it
        // renders INSTANTLY from local data with no network round-trip.
        guard !decodedAPIMessages.isEmpty else { return }
        do {
            try await DependencyContainer.shared.messagePersistence
                .upsertFromAPIMessages(decodedAPIMessages, preferredLanguages: engravingPrism)
            // Only drop the prefetch files once the messages are committed to GRDB,
            // so a persist failure leaves them on disk to retry next launch instead
            // of silently dropping the push-prefetched message.
            for url in consumedFiles {
                fm.removeItemLogging(at: url, context: "merged NSE prefetch file", logger: logger)
            }
            logger.info("Merged \(decodedAPIMessages.count) NSE messages into cache")
        } catch {
            logger.error("NSE message persist failed, keeping \(consumedFiles.count) file(s) for retry: \(error.localizedDescription)")
        }
    }

    /// La lecture disque ET le décodage, dans une tâche DÉTACHÉE.
    ///
    /// `Task.detached` et non `nonisolated async` : sous SE-0461 une fonction
    /// `async` non isolée appelée depuis le MainActor s'y exécute quand même.
    /// Ce qui traverse la frontière est `Sendable` de part en part
    /// (`DecodedPending`, `[URL]`), donc rien du modèle ne voyage.
    ///
    /// Les charges illisibles ne sont pas SUPPRIMÉES ici : leur retrait
    /// journalise, et le journal appartient à l'instance. Elles remontent par
    /// leur URL et l'appelant les retire.
    private nonisolated static func readAndDecodePending() async -> (decoded: [DecodedPending], corrupt: [URL]) {
        await Task.detached(priority: .userInitiated) { () -> (decoded: [DecodedPending], corrupt: [URL]) in
            let pending = Self.readPending()
            guard !pending.isEmpty else { return ([], []) }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .custom { decoder in
                let container = try decoder.singleValueContainer()
                let dateStr = try container.decode(String.self)
                // Modern Date.ISO8601FormatStyle supports fractional seconds and
                // is more efficient than legacy ISO8601DateFormatter.
                if let date = try? Date(dateStr, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
                    return date
                }
                if let date = try? Date(dateStr, strategy: .iso8601) {
                    return date
                }
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
            }

            var decoded: [DecodedPending] = []
            var corrupt: [URL] = []
            for item in pending {
                guard let apiMsg = try? decoder.decode(APIMessage.self, from: item.data) else {
                    corrupt.append(item.url)
                    continue
                }
                decoded.append(DecodedPending(conversationId: item.conversationId, url: item.url, message: apiMsg))
            }
            return (decoded, corrupt)
        }.value
    }

    /// Reads (without deleting) every prefetched message blob. Deletion is deferred
    /// to ``consumeAll`` and happens only after the GRDB commit succeeds, so a
    /// transient failure never drops a push-prefetched message off disk.
    private nonisolated static func readPending() -> [(conversationId: String, url: URL, data: Data)] {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupId
        ) else { return [] }

        let dir = container.appendingPathComponent(Self.pendingDirName, isDirectory: true)
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return []
        }

        var results: [(conversationId: String, url: URL, data: Data)] = []
        for file in files where file.pathExtension == "json" {
            let name = file.deletingPathExtension().lastPathComponent
            let parts = name.split(separator: "_", maxSplits: 1)
            guard parts.count == 2, let data = try? Data(contentsOf: file) else { continue }
            results.append((conversationId: String(parts[0]), url: file, data: data))
        }
        return results
    }
}
