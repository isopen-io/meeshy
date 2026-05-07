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
                    SharePickerView(
                        sharedContent: content,
                        onDismiss: {
                            router.pendingShareContent = nil
                        }
                    )
                    .environmentObject(conversationViewModel)
                    .environmentObject(router)
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
            }
            .fullScreenCover(isPresented: Binding(
                get: { callManager.callState.isActive },
                set: { if !$0 { callManager.endCall() } }
            )) {
                CallView()
            }
    }
}
