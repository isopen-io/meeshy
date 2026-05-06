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

    private var loadedCount = 50

    // MARK: - Off-main DB read

    private func refreshFromDB() async {
        let reader = persistence.reader
        let limit = loadedCount
        let newPosts = await Task.detached(priority: .userInitiated) {
            try? reader.read { db in
                try PostRecord.order(Column("createdAt").desc).limit(limit).fetchAll(db)
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
        guard posts.last != nil else { return false }
        let previousCount = loadedCount
        loadedCount += 20
        await refreshFromDB()
        return posts.count > previousCount
    }
}
