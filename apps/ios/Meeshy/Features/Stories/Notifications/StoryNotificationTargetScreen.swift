import SwiftUI
import MeeshySDK

// MARK: - StoryNotificationTargetScreen
//
// Top-level destination presented when the user taps a story-related
// notification (`storyReaction` / `statusReaction` / story-flavoured
// `postComment`). Composes the three Phase E/F/D states surfaced by
// `StoryNotificationTargetViewModel`:
//
//   .loading  → `StoryNotificationLoadingView` skeleton (rare cold-start path).
//   .active   → `StoryActiveBridge`, which redirects into the existing
//               `StoryViewerView` carrying the right `initialAction`
//               (comments overlay vs. viewers/reactions sheet) so the user
//               lands on the surface that maps to the notification trigger.
//   .expired  → `StoryExpiredContent` empty-state with "Create a story" CTA.
//   .offline  → `StoryNotificationOfflineContent` retry state — a confirmed
//               404 is the only thing allowed to claim `.expired`; any other
//               failure (no connectivity, timeout, 5xx) lands here instead.
//
// Dependencies:
// - `StoryServiceProviding` is injected through the initialiser with a
//   `StoryService.shared` default, mirroring the project's lightweight DI
//   pattern (the rest of the app reaches for `.shared` directly).
// - `StoryViewerCoordinator` is consumed via `@EnvironmentObject` so the
//   screen can talk to RootView's coordinator without threading a binding
//   through the navigation stack. RootView injects it once at the root.

public struct StoryNotificationTargetScreen: View {

    @StateObject private var vm: StoryNotificationTargetViewModel
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
    @Environment(\.dismiss) private var dismiss

    public init(
        storyId: String,
        intent: StoryIntent,
        context: StoryNotificationContext,
        storyService: StoryServiceProviding = StoryService.shared
    ) {
        _vm = StateObject(wrappedValue: StoryNotificationTargetViewModel(
            storyId: storyId,
            intent: intent,
            context: context,
            storyService: storyService
        ))
    }

    public var body: some View {
        Group {
            switch vm.state {
            case .loading:
                StoryNotificationLoadingView()
            case .active(let post):
                StoryActiveBridge(
                    post: post,
                    intent: vm.intent,
                    viewerCoordinator: storyViewerCoordinator,
                    dismiss: { dismiss() }
                )
            case .expired:
                StoryExpiredContent(storyId: vm.storyId, context: vm.context)
            case .offline:
                StoryNotificationOfflineContent {
                    Task { await vm.load() }
                }
            }
        }
        .task { await vm.load() }
    }
}
