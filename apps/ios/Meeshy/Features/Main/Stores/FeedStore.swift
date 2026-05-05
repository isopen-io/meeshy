// apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift

import Foundation
import Observation
import Combine
import GRDB
import MeeshySDK

@Observable
@MainActor
public final class FeedStore {
    private(set) var posts: [PostRecord] = []
    private let persistence: FeedPersistenceActor
    private var regionCancellable: AnyDatabaseCancellable?

    let postsDidChange = PassthroughSubject<Void, Never>()

    init(persistence: FeedPersistenceActor) {
        self.persistence = persistence
    }

    // MARK: - Observation

    func startObserving(dbPool: any DatabaseWriter) {
        stopObserving()
        let request = PostRecord.order(Column("createdAt").desc)

        regionCancellable = DatabaseRegionObservation(tracking: request)
            .start(in: dbPool, onError: { _ in }) { [weak self] _ in
                Task { [weak self] in
                    await self?.refreshFromDB()
                }
            }
    }

    func stopObserving() {
        regionCancellable = nil
    }

    // MARK: - Off-main DB read

    private func refreshFromDB() async {
        let reader = persistence.reader
        let newPosts = await Task.detached(priority: .userInitiated) {
            try? reader.read { db in
                try PostRecord.order(Column("createdAt").desc).limit(50).fetchAll(db)
            }
        }.value

        guard let newPosts, newPosts != posts else { return }
        posts = newPosts
        postsDidChange.send()
    }

    // MARK: - Load Initial

    func loadInitial() async {
        await refreshFromDB()
    }

    // MARK: - Pagination

    func loadOlder() async -> Bool {
        guard let lastDate = posts.last?.createdAt else { return false }
        let reader = persistence.reader
        let older = await Task.detached(priority: .userInitiated) {
            try? reader.read { db in
                try PostRecord
                    .filter(Column("createdAt") < lastDate)
                    .order(Column("createdAt").desc)
                    .limit(20)
                    .fetchAll(db)
            }
        }.value
        guard let older, !older.isEmpty else { return false }
        posts.append(contentsOf: older)
        postsDidChange.send()
        return true
    }
}
