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
        let records: [OutboxRecord]
        do {
            records = try await pool.read { db in
                try OutboxRecord
                    .filter(Column("kind") == OutboxKind.createPost.rawValue)
                    .filter(Column("cancelRequestedAt") == nil)
                    .order(Column("createdAt").desc)
                    .fetchAll(db)
            }
        } catch {
            logger.error("unsentPublications read failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
        return records.compactMap { record in
            guard let draft = Self.recoveredPost(from: record) else { return nil }
            return UnsentPublication(draft: draft, state: UnsentPublication.State(record.status),
                                     lastError: record.lastError)
        }
    }

    /// Le brouillon que porte une ligne `.createPost` — `nil` si elle ne se décode pas.
    static func recoveredPost(from record: OutboxRecord) -> RecoveredOfflinePost? {
        guard let payload = try? JSONDecoder().decode(CreatePostPayload.self, from: record.payload) else {
            return nil
        }
        let urls: [URL] = (payload.localMediaPaths ?? []).compactMap { stored in
            let path = absoluteMediaPath(forStored: stored)
            return FileManager.default.fileExists(atPath: path) ? URL(fileURLWithPath: path) : nil
        }
        return RecoveredOfflinePost(
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

extension UnsentPublication.State {
    init(_ status: OutboxStatus) {
        switch status {
        case .pending: self = .waiting
        case .inflight: self = .sending
        case .failed, .exhausted: self = .failed
        }
    }
}
