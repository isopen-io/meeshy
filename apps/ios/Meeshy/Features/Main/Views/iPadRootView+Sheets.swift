import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View Sheets & Full-Screen Covers

extension iPadRootView {

    func applyingSheets(_ content: some View) -> some View {
        content
            .sheet(item: $router.deepLinkProfileUser) { user in
                UserProfileSheet(
                    user: user,
                    moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                    onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showSharePicker) {
                if let content = router.pendingShareContent {
                    // SwiftUI sheets create a separate presentation hierarchy and
                    // do NOT inherit EnvironmentObjects from the parent view
                    // automatically. Re-inject the trio that SharePickerView
                    // declares as @EnvironmentObject (conversationListViewModel,
                    // router, statusViewModel), otherwise tapping share crashes
                    // with "EnvironmentObject error → SharePickerView.<missing>".
                    SharePickerView(
                        sharedContent: content,
                        onDismiss: {
                            router.pendingShareContent = nil
                        }
                    )
                    .environmentObject(conversationViewModel)
                    .environmentObject(router)
                    .environmentObject(statusViewModel)
                    .presentationDetents([.medium, .large])
                }
            }
            .onChange(of: router.pendingShareContent != nil) { _, hasContent in
                if hasContent { showSharePicker = true }
            }
            .sheet(isPresented: $showNewConversation) {
                NewConversationView()
                    .environmentObject(statusViewModel)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .fullScreenCover(isPresented: $showStoryViewerFromConv) {
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: selectedStoryUserIdFromConv,
                    isPresented: $showStoryViewerFromConv,
                    onReplyToStory: { replyContext in
                        showStoryViewerFromConv = false
                        handleStoryReply(replyContext)
                    },
                    presentationSource: "iPadRootView.conv"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
            }
            // Coordinator-driven viewer cover used by
            // `StoryNotificationTargetScreen` → `StoryActiveBridge`. Mirrors
            // RootView (iPhone): assigning `pendingRequest` presents the
            // viewer, `nil` dismisses. Decoupled from
            // `showStoryViewerFromConv` so the legacy tray path keeps its
            // own cover.
            .fullScreenCover(item: $storyViewerCoordinator.pendingRequest) { request in
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: request.id,
                    isPresented: Binding(
                        get: { storyViewerCoordinator.pendingRequest != nil },
                        set: { if !$0 { storyViewerCoordinator.dismiss() } }
                    ),
                    onReplyToStory: { replyContext in
                        storyViewerCoordinator.dismiss()
                        handleStoryReply(replyContext)
                    },
                    presentationSource: "iPadRootView.fromConv",
                    initialAction: request.initialAction
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
            }
            // Mirror RootView's split call presentation: `.fullScreen`
            // mode → cover; `.pip` mode → overlay pill. Swiping the cover
            // down minimizes instead of ending the call.
            .fullScreenCover(isPresented: Binding(
                get: { callManager.callState.isActive && callManager.displayMode == .fullScreen },
                set: { if !$0 { callManager.displayMode = .pip } }
            )) {
                CallView()
            }
            .overlay(alignment: .top) {
                FloatingCallPillView()
                    .padding(.top, 8)
            }
    }
}
