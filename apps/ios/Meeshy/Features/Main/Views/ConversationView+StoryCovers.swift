import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les deux plein écrans de story qu'ouvre la conversation
//
// Extrait de `ConversationView.swift` (cohésion). Une conversation ouvre le
// lecteur de stories de deux endroits — l'avatar de son en-tête, et l'anneau
// ou la citation d'une bulle — et chacun a sa source de présentation. Le
// modificateur emporte les deux covers ET leur câblage : l'hôte n'y porte plus
// que deux états, qu'il lie plutôt qu'il ne copie (ce sont des structs tenues
// en `@State`).

struct ConversationStoryViewerCovers: ViewModifier {
    @Binding var headerState: ConversationHeaderState
    @Binding var overlayState: ConversationOverlayState

    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var router: Router
    @Environment(\.meeshyConversationList) private var conversationListViewModel
    /// U1 inc.2 — namespace zoom injecté par RootView (no-op < iOS 18/nil).
    @Environment(\.zoomTransitionNamespace) private var zoomNamespace

    func body(content: Content) -> some View {
        content
            .conversationCover(isPresented: $headerState.showStoryViewerFromHeader) {
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: headerState.storyUserIdForHeader,
                    isPresented: $headerState.showStoryViewerFromHeader,
                    onReplyToStory: { replyContext in
                        headerState.showStoryViewerFromHeader = false
                        router.navigateToStoryReply(replyContext, conversationList: conversationListViewModel)
                    },
                    singleGroup: true,
                    startAtFirstUnviewed: true,
                    presentationSource: "ConversationView.header"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .conversationListObject(conversationListViewModel)
                // U1 inc.2 — zoom depuis la bulle si elle est enregistrée
                // (tray in-chat), fallback cover standard sinon (avatar header).
                .zoomTransitionDestination(sourceID: headerState.storyUserIdForHeader ?? "", in: zoomNamespace)
            }
            .conversationCover(isPresented: $overlayState.showStoryViewer) {
                StoryViewerContainer(
                    viewModel: storyViewModel,
                    userId: overlayState.storyViewerUserId,
                    isPresented: $overlayState.showStoryViewer,
                    onReplyToStory: { replyContext in
                        overlayState.showStoryViewer = false
                        router.navigateToStoryReply(replyContext, conversationList: conversationListViewModel)
                    },
                    singleGroup: true,
                    postId: overlayState.storyViewerPostId,
                    initialStoryIndex: overlayState.storyViewerSlideIndex,
                    startAtFirstUnviewed: overlayState.storyViewerStartAtFirstUnviewed,
                    presentationSource: "ConversationView.overlay"
                )
                // Re-inject env objects required by StoryViewerView for its
                // internal SharePickerView sheet. fullScreenCover does NOT
                // inherit EnvironmentObjects automatically.
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .conversationListObject(conversationListViewModel)
                .zoomTransitionDestination(sourceID: overlayState.storyViewerUserId ?? "", in: zoomNamespace)
            }
    }
}
