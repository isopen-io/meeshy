// apps/ios/Meeshy/Features/Main/Stores/CommentStore.swift

import Foundation
import Observation
import GRDB
import MeeshySDK

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
        let pid = postId
        let reader = persistence.reader
        let comments = await Task.detached(priority: .userInitiated) {
            try? reader.read { db in
                try CommentRecord
                    .filter(Column("postId") == pid)
                    .filter(Column("parentId") == nil)
                    .order(Column("createdAt").desc)
                    .limit(30)
                    .fetchAll(db)
            }
        }.value
        topLevelComments = comments ?? []
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
        let pid = postId
        let reader = persistence.reader
        let replies = await Task.detached(priority: .userInitiated) {
            try? reader.read { db in
                try CommentRecord
                    .filter(Column("postId") == pid)
                    .filter(Column("parentId") == parentId)
                    .order(Column("createdAt").asc)
                    .limit(50)
                    .fetchAll(db)
            }
        }.value
        repliesCache[parentId] = replies ?? []
    }

    // MARK: - Pagination

    func loadMore() async -> Bool {
        guard let lastDate = topLevelComments.last?.createdAt else { return false }
        let pid = postId
        let reader = persistence.reader
        let older = await Task.detached(priority: .userInitiated) {
            try? reader.read { db in
                try CommentRecord
                    .filter(Column("postId") == pid)
                    .filter(Column("parentId") == nil)
                    .filter(Column("createdAt") < lastDate)
                    .order(Column("createdAt").desc)
                    .limit(20)
                    .fetchAll(db)
            }
        }.value
        guard let older, !older.isEmpty else { return false }
        topLevelComments.append(contentsOf: older)
        return true
    }
}
