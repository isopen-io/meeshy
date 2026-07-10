import Foundation
import SwiftUI
import MeeshySDK

// MARK: - StoryNotificationTargetViewModel
// Drives the screen that opens when the user taps a story-related notification.
// Cache-first / network-revalidate pattern:
//   1. Synchronously read the in-memory story cache (StoryService.cachedPost).
//      If found, immediately publish .active or .expired so the UI never shows
//      a spinner when we already know the answer.
//   2. Always re-fetch from the network. The fresh result wins (a previously
//      active cached story may now be expired). If the network fetch fails and
//      we still hold the .loading sentinel, fall back to .expired so the screen
//      can render a useful empty state.
//
// State semantics:
//   .loading  — initial value, no answer yet (first frame before cache lookup).
//   .active   — story exists and has not expired yet.
//   .expired  — story is gone or its expiresAt has passed.

@MainActor
public final class StoryNotificationTargetViewModel: ObservableObject {

    public enum LoadState {
        case loading
        case active(APIPost)
        case expired
    }

    @Published public private(set) var state: LoadState = .loading

    public let storyId: String
    public let intent: StoryIntent
    public let context: StoryNotificationContext

    private let storyService: StoryServiceProviding

    public init(
        storyId: String,
        intent: StoryIntent,
        context: StoryNotificationContext,
        storyService: StoryServiceProviding
    ) {
        self.storyId = storyId
        self.intent = intent
        self.context = context
        self.storyService = storyService
    }

    // Cache-first read followed by silent network revalidation.
    // Idempotent: callers may invoke load() multiple times safely (e.g. on
    // .task + pull-to-refresh). The state is replaced atomically each time.
    public func load() async {
        if let cached = storyService.cachedPost(id: storyId) {
            state = isExpired(cached) ? .expired : .active(cached)
        }

        do {
            let fresh = try await storyService.fetchPost(id: storyId)
            state = isExpired(fresh) ? .expired : .active(fresh)
        } catch {
            // Only fall back to .expired if we never produced a usable answer
            // from the cache. If the cache already gave us .active or .expired,
            // we keep that result rather than overwriting with a network error.
            if case .loading = state { state = .expired }
        }
    }

    private func isExpired(_ post: APIPost) -> Bool {
        guard let expiresAt = post.expiresAt else { return false }
        return expiresAt <= Date.now
    }
}
