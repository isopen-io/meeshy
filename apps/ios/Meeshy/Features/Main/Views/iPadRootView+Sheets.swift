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
                    .environmentObject(StatusBubbleController.shared)
                    .presentationDetents([.medium, .large])
                }
            }
            .adaptiveOnChange(of: router.pendingShareContent != nil) { _, hasContent in
                if hasContent { showSharePicker = true }
            }
            .sheet(isPresented: $showNewConversation) {
                NewConversationView()
                    .environmentObject(statusViewModel)
                    .environmentObject(StatusBubbleController.shared)
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
                    startAtFirstUnviewed: true,
                    presentationSource: "iPadRootView.conv"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                // Cf. fix sync pill chevauchement 2026-05-27 dans RootView.
                .environment(\.isStoryViewerPresenting, true)
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
                    startAtFirstUnviewed: request.startAtFirstUnviewed,
                    presentationSource: "iPadRootView.fromConv",
                    initialAction: request.initialAction
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                // Cf. fix sync pill chevauchement 2026-05-27 dans RootView.
                .environment(\.isStoryViewerPresenting, true)
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
            // §7.6 — call-waiting banner (2nd incoming call during an active one).
            .overlay(alignment: .top) {
                if callManager.showCallWaitingBanner {
                    CallWaitingBannerView(
                        callerName: callManager.pendingIncomingCall?.fromUsername
                            ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main),
                        isVisible: $callManager.showCallWaitingBanner,
                        onReject: { callManager.rejectPendingCall() },
                        onEndAndAnswer: { callManager.endCurrentAndAnswerPending() }
                    )
                    .padding(.top, 8)
                }
            }
    }
}
