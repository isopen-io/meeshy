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
//   .loading         — initial value, no answer yet (first frame before cache lookup).
//   .active          — story is renderable: not expired, OR expired with a
//                      GRANTED reference right (Task 9 — the server DECLARES
//                      the right via `APIPost.referenceAccess`; this ViewModel
//                      never recomputes it from `expiresAt`).
//   .expired         — the story is CONFIRMED gone (404), or its expiresAt has
//                      passed with no reference right at all (`.none`/`nil`).
//   .expiredConsumed — expired AND the reference right is `.consumed`: the
//                      24h post-expiration window has closed. Distinct from
//                      `.expired` so a future screen can tell "never had a
//                      right" apart from "had one, it ran out".
//   .offline         — the network call failed for any OTHER reason (no
//               connectivity, timeout, 5xx). The story may still exist — we
//               just couldn't confirm it. Retryable via `load()`, never
//               conflated with a genuine 404 (P2 — a tap while offline used to
//               show the same "Story expired, create a new one" empty state
//               as a real 404).

@MainActor
public final class StoryNotificationTargetViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    public enum LoadState {
        case loading
        case active(APIPost)
        case expired
        case expiredConsumed
        case offline
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
        // Drain any story post the NSE prefetched for this notification into the
        // StoryService by-id tray BEFORE the cached read, so a cold-start tap
        // renders from local data instead of waiting on `fetchPost`. No-op when
        // nothing was prefetched (mirror of ConversationViewModel/PostDetailViewModel).
        await NSEPendingPostConsumer.shared.consumeAll()

        if let cached = storyService.cachedPost(id: storyId) {
            state = state(for: cached)
        }

        do {
            let fresh = try await storyService.fetchPost(id: storyId)
            state = state(for: fresh)
        } catch {
            // Only replace .loading — if the cache already gave us .active or
            // .expired, keep that result rather than overwriting with a
            // network-error guess. Only a CONFIRMED 404 may claim .expired;
            // anything else (offline, timeout, 5xx) is .offline — the story
            // may well still exist, we just couldn't confirm it.
            if case .loading = state {
                state = Self.isNotFound(error) ? .expired : .offline
            }
        }
    }

    private func isExpired(_ post: APIPost) -> Bool {
        guard let expiresAt = post.expiresAt else { return false }
        return expiresAt <= Date.now
    }

    /// Le droit se DÉCLARE, il ne se déduit pas.
    ///
    /// `isExpired` ne voit que `expiresAt` et ignore tout de la référence :
    /// s'en remettre à lui ferait refuser un contenu que le serveur autorise.
    /// Il reste utile pour ce qu'il sait faire — masquer du tray, griser un
    /// aperçu — mais l'OUVERTURE obéit au verdict.
    ///
    /// `?? .none` évite le piège Swift où `case .none` dans un switch sur un
    /// `ReferenceAccess?` se lie à `Optional.none` (nil) et non au cas enum
    /// `ReferenceAccess.none` — ici les deux doivent de toute façon produire
    /// le même repli, donc on les unifie explicitement avant le switch plutôt
    /// que de laisser le compilateur trancher une ambiguïté.
    private func state(for post: APIPost) -> LoadState {
        switch post.referenceAccess ?? .none {
        case .granted:  return .active(post)
        case .consumed: return .expiredConsumed
        case .none:     return isExpired(post) ? .expired : .active(post)
        }
    }

    private static func isNotFound(_ error: Error) -> Bool {
        if case APIError.serverError(let statusCode, _) = error { return statusCode == 404 }
        return false
    }
}
