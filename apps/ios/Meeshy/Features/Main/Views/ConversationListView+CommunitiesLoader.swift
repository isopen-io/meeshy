import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - Load Communities

/// Cache-first community load (iOS Local-First Wave 1, Task 2.1).
///
/// Flow:
/// - `.fresh` -> apply cache, no network call.
/// - `.stale` -> apply cache immediately, then revalidate silently;
///   the fresh result replaces the cached one when it lands.
/// - `.expired`/`.empty` -> fetch the network, apply, persist.
///
/// The cache key is the single bucket `"list"` because the conversation
/// list only ever calls `CommunityService.shared.list(offset: 0, limit: 10)`
/// (no search, fixed window). A different bucket / param-aware key would
/// be needed if the call surface grew to support pagination or search.
enum ConversationListCommunitiesLoader {
    static func load(apply: @escaping @MainActor ([APICommunity]) -> Void) async {
        let cacheKey = "list"
        let cacheResult = await CacheCoordinator.shared.communities.load(for: cacheKey)
        switch cacheResult {
        case .fresh(let cached, _):
            apply(cached)
        case .stale(let cached, _):
            apply(cached)
            Task {
                do {
                    let response = try await CommunityService.shared.list(offset: 0, limit: 10)
                    apply(response.data)
                    await bestEffort("conversationListViewCommunitiesLoader.communities.save", category: .cache) { try await CacheCoordinator.shared.communities.save(response.data, for: cacheKey) }
                } catch {
                    Logger.cache.warning("[ConversationListView] Communities silent revalidate failed: \(error.localizedDescription)")
                }
            }
        case .expired, .empty:
            do {
                let response = try await CommunityService.shared.list(offset: 0, limit: 10)
                apply(response.data)
                await bestEffort("conversationListViewCommunitiesLoader.communities.save.2", category: .cache) { try await CacheCoordinator.shared.communities.save(response.data, for: cacheKey) }
            } catch {
                Logger.messages.error("[ConversationListView] Error loading communities: \(error.localizedDescription)")
            }
        }
    }
}
