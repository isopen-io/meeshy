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
            .sheet(isPresented: $showJoinFlow) {
                if let identifier = joinFlowIdentifier {
                    JoinFlowSheet(identifier: identifier) { joinResponse in
                        handleJoinSuccess(joinResponse)
                    }
                }
            }
            .sheet(isPresented: $showNewConversation) {
                NewConversationView()
                    .environmentObject(statusViewModel)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .fullScreenCover(isPresented: $showStoryViewerFromConv) {
                if let userId = selectedStoryUserIdFromConv {
                    StoryViewerContainer(
                        viewModel: storyViewModel,
                        userId: userId,
                        isPresented: $showStoryViewerFromConv,
                        onReplyToStory: { replyContext in
                            showStoryViewerFromConv = false
                            handleStoryReply(replyContext)
                        }
                    )
                }
            }
            .fullScreenCover(isPresented: Binding(
                get: { callManager.callState.isActive },
                set: { if !$0 { callManager.endCall() } }
            )) {
                CallView()
            }
    }
}
