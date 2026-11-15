import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le détail d'un post, présenté en FEUILLE par la racine iPhone (#16676).
///
/// `Router.push(.postDetail)` pose `presentedPost` au lieu d'empiler un écran :
/// le fil, la liste ou le réel restent dessous, et la feuille se referme par
/// son ✕ ou d'un glissé vers le bas (détentes système, progressives et
/// annulables). Une feuille crée un environnement neuf : les objets que lit le
/// détail y sont réinjectés, comme pour l'aperçu de conversation.
struct PostDetailSheetHost: ViewModifier {
    @ObservedObject var router: Router
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationViewModel: ConversationListViewModel
    let storyViewerCoordinator: StoryViewerCoordinator

    func body(content: Content) -> some View {
        content
            .sheet(item: $router.presentedPost) { post in
                PostDetailView(
                    postId: post.postId,
                    initialPost: post.initialPost,
                    showComments: post.showComments,
                    targetCommentId: post.commentId,
                    targetParentCommentId: post.parentCommentId
                )
                .modifier(MeeshyRouterInjection(router: router))
                .environmentObject(storyViewModel)
                .environmentObject(statusViewModel)
                .meeshyConversationList(conversationViewModel)
                .environmentObject(storyViewerCoordinator)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
    }
}
