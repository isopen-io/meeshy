import Foundation
import os

/// Async actor managing per-conversation message drafts with debounced writes.
///
/// Reads hit the `CacheCoordinator.drafts` GRDB store directly (one actor
/// hop, no IO when L1 is warm). Writes coalesce keystrokes via a 500 ms
/// debounce so a typist hammering the keyboard produces at most ~2 GRDB
/// transactions per second per conversation. Empty saves bypass the debounce
/// and clear the record immediately — clearing should be perceived as
/// instant by the caller (e.g. right after a successful send) and there is
/// no risk of a clear racing a stale typed value.
///
/// Task 2.2 of the iOS Local-First Wave 1 plan.
public actor ConversationDraftManager {
    public static let shared = ConversationDraftManager()

    private let cache: CacheCoordinator
    private let debounce: TimeInterval
    private var pendingTasks: [String: Task<Void, Never>] = [:]
    private let logger = Logger(subsystem: "me.meeshy.app", category: "drafts")

    public init(
        cache: CacheCoordinator = .shared,
        debounce: TimeInterval = 0.5
    ) {
        self.cache = cache
        self.debounce = debounce
    }

    /// Schedule a debounced save. Any previous pending save for the same
    /// conversation is cancelled — only the latest value reaches disk.
    /// An empty text bypasses the debounce: the record is invalidated
    /// immediately so a sent-then-cleared composer doesn't briefly resurrect
    /// an outdated draft on the next read.
    public func save(_ text: String, for conversationId: String) async {
        pendingTasks[conversationId]?.cancel()
        if text.isEmpty {
            pendingTasks[conversationId] = Task { [cache] in
                await cache.drafts.invalidate(for: conversationId)
            }
            return
        }
        let debounce = self.debounce
        let draft = ConversationDraft(conversationId: conversationId, text: text, updatedAt: Date())
        pendingTasks[conversationId] = Task { [cache, logger] in
            try? await Task.sleep(nanoseconds: UInt64(debounce * 1_000_000_000))
            guard !Task.isCancelled else { return }
            do {
                try await cache.drafts.save([draft], for: conversationId)
            } catch {
                logger.error("Failed to persist draft for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Synchronous read from cache. Returns `nil` if no draft exists, the
    /// draft is empty, or it has been evicted past the policy TTL.
    public func draft(for conversationId: String) async -> String? {
        let result = await cache.drafts.load(for: conversationId)
        switch result {
        case .fresh(let drafts, _), .stale(let drafts, _):
            return drafts.first?.text
        case .expired, .empty:
            return nil
        }
    }

    /// Explicitly clear a draft (e.g. after a successful send). Cancels any
    /// pending debounced write so a stale keystroke can't resurrect the
    /// just-cleared draft.
    public func clear(for conversationId: String) async {
        pendingTasks[conversationId]?.cancel()
        pendingTasks[conversationId] = nil
        await cache.drafts.invalidate(for: conversationId)
    }
}
