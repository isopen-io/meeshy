import SwiftUI
import MeeshySDK

// MARK: - StoryViewerCoordinating
//
// Surface used by StoryActiveBridge to hand off a fully-formed
// StoryViewerRequest to whatever owns the @State that drives RootView's
// `.fullScreenCover(item: $storyViewerRequest)` (or the iPad equivalent).
// Modelled as a class-bound protocol so concrete coordinators can be
// reference types and inject themselves through `.environmentObject` /
// init injection without forcing every call site through Combine.
//
// Decoupling the bridge from a concrete coordinator keeps the bridge unit-
// testable: tests pass a mock coordinator and assert on the request that
// was forwarded, with no SwiftUI hosting required.
//
// Internal (not public) because StoryViewerRequest is internal — both
// types live in the Meeshy app target, not the SDK.

@MainActor
protocol StoryViewerCoordinating: AnyObject {
    func present(_ request: StoryViewerRequest)
}

// MARK: - StoryActiveBridge
//
// Thin SwiftUI surface used by the story-notification flow (Phase F) to
// redirect into the existing StoryViewerView. Surfaced as a View only so
// it can hook into a `.task` / `.onAppear` lifecycle inside the parent's
// navigation stack — the visible body is intentionally just the loading
// skeleton because the bridge dismisses itself within ~250 ms once the
// viewer is presented over the top.
//
// Flow:
//   1. The notification target screen resolves the underlying APIPost
//      (StoryNotificationTargetViewModel → .active(post)).
//   2. The screen pushes / presents this bridge with the post + the
//      original StoryIntent (.comments / .reactions).
//   3. handleAppear() builds a StoryViewerRequest carrying the matching
//      StoryViewerInitialAction, hands it to the coordinator, and dismisses
//      the bridge so the viewer animates in cleanly.
//
// `viewerCoordinator` is held by reference (`any StoryViewerCoordinating`)
// because the receiver is the long-lived RootView coordinator that owns
// the @State binding driving the fullScreenCover.

@MainActor
struct StoryActiveBridge: View {

    let post: APIPost
    let intent: StoryIntent
    let viewerCoordinator: any StoryViewerCoordinating
    let dismiss: () -> Void

    init(
        post: APIPost,
        intent: StoryIntent,
        viewerCoordinator: any StoryViewerCoordinating,
        dismiss: @escaping () -> Void
    ) {
        self.post = post
        self.intent = intent
        self.viewerCoordinator = viewerCoordinator
        self.dismiss = dismiss
    }

    var body: some View {
        StoryNotificationLoadingView()
            .onAppear { handleAppear() }
    }

    /// Presents the viewer through the coordinator and dismisses self.
    /// Internal so the unit tests can drive the bridge synchronously without
    /// hosting it in a SwiftUI scene.
    func handleAppear() {
        let action: StoryViewerInitialAction? = {
            switch intent {
            case .comments: return .showCommentsOverlay
            case .reactions: return .showViewersSheet
            case .view: return nil
            }
        }()

        let request = StoryViewerRequest(id: post.author.id, initialAction: action)
        viewerCoordinator.present(request)
        dismiss()
    }
}
