import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le lecteur de stories qu'ouvre la conversation
//
// Une conversation ouvre le lecteur de deux endroits — l'avatar de son en-tête,
// et l'anneau ou la citation d'une bulle. Chacun garde son état (des structs
// tenues en `@State`) ; les deux se projettent en UNE `StoryViewerRequest`, que
// monte le couvercle UNIQUE du lecteur (`StoryReaderCover`, #11197) — le même
// que les racines et les favoris.

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
        content.modifier(StoryReaderCover(
            request: request,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            router: router,
            conversationList: conversationListViewModel,
            presentationSource: overlayState.showStoryViewer ? "ConversationView.overlay" : "ConversationView.header",
            zoomNamespace: zoomNamespace,
            coversConversation: true,
            onReply: { replyContext in
                router.navigateToStoryReply(replyContext, conversationList: conversationListViewModel)
            }
        ))
    }

    private var request: Binding<StoryViewerRequest?> {
        Binding(
            get: { ConversationStoryReaderRequest.resolve(header: headerState, overlay: overlayState) },
            set: { presented in
                guard presented == nil else { return }
                headerState.showStoryViewerFromHeader = false
                overlayState.showStoryViewer = false
            }
        )
    }
}

/// Ce que la conversation demande au lecteur, projeté de ses deux états.
/// Pur : testable sans hôte SwiftUI.
enum ConversationStoryReaderRequest {
    static func resolve(header: ConversationHeaderState,
                        overlay: ConversationOverlayState) -> StoryViewerRequest? {
        if overlay.showStoryViewer, let userId = overlay.storyViewerUserId {
            return StoryViewerRequest(
                id: userId,
                startAtFirstUnviewed: overlay.storyViewerStartAtFirstUnviewed,
                singleGroup: true,
                postId: overlay.storyViewerPostId,
                initialStoryIndex: overlay.storyViewerSlideIndex
            )
        }
        if header.showStoryViewerFromHeader, let userId = header.storyUserIdForHeader {
            return StoryViewerRequest(id: userId, startAtFirstUnviewed: true, singleGroup: true)
        }
        return nil
    }
}
