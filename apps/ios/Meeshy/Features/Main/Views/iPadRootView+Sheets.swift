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
                    onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                    presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                    postsContent: { uid in
                        AnyView(ProfileUserPostsList(userId: uid, onOpenPost: { post in
                            router.deepLinkProfileUser = nil
                            router.push(.postDetail(post.id, post))
                        }))
                    }
                )
                .presentationDetents([.large, .medium])
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
            .adaptiveOnChange(of: router.pendingShareContent != nil) { _, hasContent in
                if hasContent { showSharePicker = true }
            }
            .sheet(isPresented: $showNewConversation) {
                NewConversationView()
                    .environmentObject(statusViewModel)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            // Notification preview: long-press / pull-down on a toast opens the
            // conversation (last messages + simple composer) as a sheet. A tap
            // anywhere over the messages opens the full conversation in the
            // right column. A sheet creates a fresh environment, so the objects
            // the reused `ConversationView` reads must be re-injected.
            .sheet(item: $notificationPreviewConversation) { conv in
                ConversationView(conversation: conv, previewMode: true, onOpenFullConversation: {
                    notificationPreviewConversation = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        openConversation(conv)
                    }
                })
                .environmentObject(router)
                .environmentObject(storyViewModel)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                .environmentObject(storyViewerCoordinator)
                .presentationDetents([.large, .medium])
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
                // U1 inc.2 — parité zoom sur le cover legacy du tray in-chat.
                .zoomTransitionDestination(sourceID: selectedStoryUserIdFromConv ?? "", in: storyZoomNamespace)
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
                    singleGroup: request.singleGroup,
                    postId: request.postId,
                    startAtFirstUnviewed: request.startAtFirstUnviewed,
                    presentationSource: "iPadRootView.fromConv",
                    initialAction: request.initialAction
                )
                // U1 inc.2 — zoom depuis la bulle enregistrée (fallback standard sinon).
                .zoomTransitionDestination(sourceID: request.id, in: storyZoomNamespace)
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
                get: {
                    CallState.shouldPresentFullScreenCover(
                        callState: callManager.callState,
                        displayMode: callManager.displayMode
                    )
                },
                set: { if !$0 { callManager.displayMode = .pip } }
            )) {
                CallView(callManager: callManager)
            }
            .overlay(alignment: .top) {
                FloatingCallPillView(callManager: callManager)
                    .padding(.top, 8)
            }
            .overlay {
                CallBubbleView(callManager: callManager)
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
                    // Audit Vague 27 — mirrors RootView's fix: force a
                    // remount (fresh onAppear/auto-dismiss timer) whenever
                    // the pending call is superseded, see RootView.swift.
                    .id(callManager.pendingIncomingCall?.callId)
                    .padding(.top, 8)
                }
            }
    }
}
