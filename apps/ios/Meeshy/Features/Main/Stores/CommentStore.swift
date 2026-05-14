// apps/ios/Meeshy/Features/Main/Stores/CommentStore.swift

import Foundation
import Observation
// See `FeedStore.swift` / `MessageStore.swift` for the rationale behind
// `@preconcurrency import GRDB`: Swift 6 strict concurrency injects
// `_swift_task_checkIsolatedSwift` at the invocation of closures passed
// to GRDB readers/writers, which crashes when GRDB runs them on its own
// dispatch queues.
@preconcurrency import GRDB
import MeeshySDK

/// Fetches the top-level comments for a post, optionally before a cursor.
/// Declared at file scope so the closure passed to `reader.read` doesn't
/// inherit any actor isolation context (which would trigger Swift 6 strict
/// concurrency runtime checks at GRDB invocation).
private func fetchTopLevelComments(
    reader: any DatabaseWriter,
    postId: String,
    before: Date? = nil,
    limit: Int
) throws -> [CommentRecord] {
    try reader.read { db in
        var query = CommentRecord
            .filter(Column("postId") == postId)
            .filter(Column("parentId") == nil)
            .order(Column("createdAt").desc)
            .limit(limit)
        if let before {
            query = query.filter(Column("createdAt") < before)
        }
        return try query.fetchAll(db)
    }
}

/// Fetches the direct replies to a parent comment. Same file-scope rationale
/// as `fetchTopLevelComments`.
private func fetchReplies(
    reader: any DatabaseWriter,
    postId: String,
    parentId: String,
    limit: Int
) throws -> [CommentRecord] {
    try reader.read { db in
        try CommentRecord
            .filter(Column("postId") == postId)
            .filter(Column("parentId") == parentId)
            .order(Column("createdAt").asc)
            .limit(limit)
            .fetchAll(db)
    }
}

@Observable
@MainActor
public final class CommentStore {
    private(set) var topLevelComments: [CommentRecord] = []
    private(set) var expandedThreads: Set<String> = []
    private var repliesCache: [String: [CommentRecord]] = [:]

    private let postId: String
    private let persistence: FeedPersistenceActor

    init(postId: String, persistence: FeedPersistenceActor) {
        self.postId = postId
        self.persistence = persistence
    }

    // MARK: - Load Initial

    func loadInitial() async {
        let reader = persistence.reader
        let fetched = try? fetchTopLevelComments(reader: reader, postId: postId, limit: 30)
        topLevelComments = fetched ?? []
    }

    // MARK: - Thread Expansion

    func replies(for parentId: String) -> [CommentRecord] {
        guard expandedThreads.contains(parentId) else { return [] }
        return repliesCache[parentId] ?? []
    }

    func toggleThread(_ parentId: String) async {
        if expandedThreads.contains(parentId) {
            expandedThreads.remove(parentId)
            repliesCache.removeValue(forKey: parentId)
        } else {
            expandedThreads.insert(parentId)
            await loadReplies(for: parentId)
        }
    }

    private func loadReplies(for parentId: String) async {
        let reader = persistence.reader
        let fetched = try? fetchReplies(
            reader: reader,
            postId: postId,
            parentId: parentId,
            limit: 50
        )
        repliesCache[parentId] = fetched ?? []
    }

    // MARK: - Pagination

    func loadMore() async -> Bool {
        guard let lastDate = topLevelComments.last?.createdAt else { return false }
        let reader = persistence.reader
        let older: [CommentRecord]
        do {
            older = try fetchTopLevelComments(
                reader: reader,
                postId: postId,
                before: lastDate,
                limit: 20
            )
        } catch {
            return false
        }
        guard !older.isEmpty else { return false }
        topLevelComments.append(contentsOf: older)
        return true
    }
}
