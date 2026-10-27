import Foundation
import GRDB
import os

/// **Une publication que le serveur n'a pas encore confirmée** (#13415) — lue
/// depuis sa ligne `.createPost`, pour la liste « Publications non envoyées ».
public struct UnsentPublication: Sendable, Equatable, Identifiable {
    public enum State: Sendable, Equatable {
        /// Elle partira seule au prochain passage de la file.
        case waiting
        /// Elle est en train de partir.
        case sending
        /// Elle ne repartira que sur un geste de l'auteur.
        case failed
    }

    public var id: String { draft.clientMutationId }
    public let draft: RecoveredOfflinePost
    public let state: State
    public let lastError: String?

    public init(draft: RecoveredOfflinePost, state: State, lastError: String?) {
        self.draft = draft
        self.state = state
        self.lastError = lastError
    }
}

extension OfflineQueue {

    /// Toutes les publications encore sur l'appareil, plus récentes d'abord,
    /// quel que soit leur âge — y compris celles dont le média a disparu
    /// (`localMediaURLs` ne porte que ce qui existe encore).
    public func unsentPublications() async -> [UnsentPublication] {
        guard let pool = outboxPool else { return [] }
        do {
            return try await pool.read(UnsentPublication.fetchAll)
        } catch {
            logger.error("unsentPublications read failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }
}

extension UnsentPublication {
    static func fetchAll(_ db: Database) throws -> [UnsentPublication] {
        try OutboxRecord
            .filter(Column("kind") == OutboxKind.createPost.rawValue)
            .filter(Column("cancelRequestedAt") == nil)
            .order(Column("createdAt").desc)
            .fetchAll(db)
            .compactMap { record in
                RecoveredOfflinePost(record: record).map {
                    UnsentPublication(draft: $0, state: State(record.status), lastError: record.lastError)
                }
            }
    }
}

extension UnsentPublication.State {
    init(_ status: OutboxStatus) {
        switch status {
        case .pending: self = .waiting
        case .inflight: self = .sending
        case .failed, .exhausted: self = .failed
        }
    }
}

extension RecoveredOfflinePost {
    /// Le brouillon que porte une ligne `.createPost` — `nil` si elle ne se décode pas.
    init?(record: OutboxRecord) {
        guard let payload = try? JSONDecoder().decode(CreatePostPayload.self, from: record.payload) else {
            return nil
        }
        let urls: [URL] = (payload.localMediaPaths ?? []).compactMap { stored in
            let path = OfflineQueue.absoluteMediaPath(forStored: stored)
            return FileManager.default.fileExists(atPath: path) ? URL(fileURLWithPath: path) : nil
        }
        self.init(
            clientMutationId: payload.clientMutationId,
            content: payload.content,
            visibility: payload.visibility,
            originalLanguage: payload.originalLanguage,
            type: (payload.type ?? "POST").uppercased(),
            moodEmoji: payload.moodEmoji,
            audioUrl: payload.audioUrl,
            audioDuration: payload.audioDuration,
            visibilityUserIds: payload.visibilityUserIds,
            localMediaURLs: urls,
            createdAt: record.createdAt
        )
    }
}

/// Les dossiers `Documents/pending-media/<cmid>` (#13415).
public enum PendingMediaDirectories {
    /// **Le balayage des dossiers d'attente VIDES** (#13415) : un dossier
    /// `pending-media/<cmid>` dont les fichiers sont partis (publication
    /// confirmée, retirée) disparaît. Un FICHIER n'est jamais effacé ici : il
    /// peut appartenir à une publication d'un autre compte de l'appareil, et il
    /// ne quitte le disque qu'au succès ou par le geste de son auteur.
    /// Un dossier vide depuis moins d'une heure est laissé : une mise en file
    /// peut être en train d'y copier ses fichiers.
    public static func sweepEmptyDirectories(olderThan age: TimeInterval = 3600, now: Date = Date()) {
        let root = OfflineQueue.absoluteMediaPath(forStored: OfflineQueue.pendingMediaDirectoryName)
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: root) else { return }
        for entry in entries {
            let path = (root as NSString).appendingPathComponent(entry)
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory), isDirectory.boolValue,
                  let contents = try? FileManager.default.contentsOfDirectory(atPath: path), contents.isEmpty,
                  let modified = (try? FileManager.default.attributesOfItem(atPath: path))?[.modificationDate] as? Date,
                  now.timeIntervalSince(modified) >= age else { continue }
            FileManager.default.removeItemLogging(atPath: path, context: "dossier d'attente vide")
        }
    }
}
