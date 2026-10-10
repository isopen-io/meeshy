import Foundation
import os

private let journalLogger = Logger(subsystem: "me.meeshy.app", category: "calls")

public protocol CallNetworkJournalStoreProviding: Sendable {
    func append(_ event: CallNetworkEvent, callId: String, startedAt: Date) async
    func journal(for callId: String) async -> CallNetworkJournal?
    func remove(callId: String) async
}

/// Local-only network and quality journal of each call (#8698) — never a
/// network call. It lives in the ACTIVE account's cache (`CacheCoordinator`),
/// so it follows the account: kept with a kept account, purged with a logged
/// out, revoked or removed one (#8674). Bounded twice: per call by
/// `CallNetworkJournal.eventCeiling`, across calls by
/// `CachePolicy.callNetworkJournals` (30 days, 200 calls).
public actor CallNetworkJournalStore: CallNetworkJournalStoreProviding {
    public static let shared = CallNetworkJournalStore()

    private let cache: CacheCoordinator
    private var live: [String: CallNetworkJournal] = [:]

    init(cache: CacheCoordinator = .shared) {
        self.cache = cache
    }

    public func append(_ event: CallNetworkEvent, callId: String, startedAt: Date) async {
        if let current = live[callId] {
            live[callId] = current.appending(event)
        } else {
            live = [callId: CallNetworkJournal(callId: callId, startedAt: startedAt, events: [event])]
            if let persisted = await stored(for: callId), let fresh = live[callId] {
                live[callId] = persisted.merging(fresh)
            }
        }
        await persist(callId: callId)
    }

    public func journal(for callId: String) async -> CallNetworkJournal? {
        await stored(for: callId)
    }

    public func remove(callId: String) async {
        live[callId] = nil
        await cache.callNetworkJournals.invalidate(for: callId)
    }

    private func stored(for callId: String) async -> CallNetworkJournal? {
        switch await cache.callNetworkJournals.load(for: callId) {
        case .fresh(let items, _), .stale(let items, _):
            return items.first
        case .expired, .empty:
            return nil
        }
    }

    private func persist(callId: String) async {
        guard let snapshot = live[callId] else { return }
        do {
            try await cache.callNetworkJournals.save([snapshot], for: callId)
        } catch {
            journalLogger.error("CallNetworkJournalStore.persist failed: \(error.localizedDescription)")
        }
    }
}
