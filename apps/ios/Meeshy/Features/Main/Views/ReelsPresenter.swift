import SwiftUI
import MeeshySDK

// MARK: - Reels Presenter

/// App-wide presenter for the immersive reel experience. A shared observable so
/// both entry points — a long-press on the feed button (RootView) and a tap on a
/// reel card (FeedView) — drive the same top-level overlay without threading an
/// `@EnvironmentObject` through every host.
///
/// Extracted from `ReelsPlayerView.swift`, which is over the file budget: the
/// failure state of a reel opened from a notification (#6508) is added HERE.
@MainActor
final class ReelsPresenter: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = ReelsPresenter()

    struct Launch: Identifiable, Equatable {
        var id = UUID()
        var seedPosts: [FeedPost]
        var startId: String?
        /// Comment targeted by a notification — when set, the reel auto-opens its
        /// comments sheet and scrolls to / highlights this comment.
        var commentId: String?
        /// Parent comment when `commentId` is a reply — the sheet expands the
        /// parent thread before scrolling to the reply.
        var parentCommentId: String?
        /// Why the reel a notification points at could not be fetched (#6508).
        /// The reader opens on this failure instead of the pager — never on the
        /// post detail, which would repeat the failed request for the same tap.
        var failure: ContentFetchFailure?
        static func == (lhs: Launch, rhs: Launch) -> Bool { lhs.id == rhs.id }
    }

    @Published var launch: Launch?

    private init() {}

    /// Opens the reels seeded from posts already on screen, starting on `startId`.
    /// `commentId` (optional) opens the comments sheet on the seed reel and scrolls
    /// to that comment — used by tapped reel comment notifications.
    func present(posts: [FeedPost], startId: String?, commentId: String? = nil, parentCommentId: String? = nil) {
        launch = Launch(
            id: readerAwaitingRetry ?? UUID(),
            seedPosts: posts,
            startId: startId,
            commentId: commentId,
            parentCommentId: parentCommentId
        )
    }

    /// Opens the reader on the failure of the reel `postId` (#6508), keeping the
    /// comment target so a successful retry lands exactly where the tap aimed.
    func presentFailure(_ failure: ContentFetchFailure, postId: String, commentId: String?, parentCommentId: String?) {
        launch = Launch(
            id: readerAwaitingRetry ?? UUID(),
            seedPosts: [],
            startId: postId,
            commentId: commentId,
            parentCommentId: parentCommentId,
            failure: failure
        )
    }

    /// Opens the reels with no seed (long-press launch); the view fetches a page.
    func presentFresh() {
        launch = Launch(seedPosts: [], startId: nil)
    }

    func dismiss() {
        launch = nil
    }

    /// A reader already open on a failure is FILLED by the retry, never opened a
    /// second time: its identity drives `.id(launch.id)` in RootView, and a new
    /// one would replay the whole reveal wave over the screen the user is on.
    private var readerAwaitingRetry: UUID? {
        guard let launch, launch.failure != nil else { return nil }
        return launch.id
    }
}
