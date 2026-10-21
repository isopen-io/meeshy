import SwiftUI
import MeeshySDK
import MeeshyUI

/// Un fil de commentaire de premier niveau du détail d'un post : la section
/// threadée, son surlignage (cible d'une notification) et ses résolveurs
/// d'humeur / story / présence. Extrait de `PostDetailView.postDetailContent`
/// — le `.id("comment-…")` d'ancrage reste posé par l'hôte.
struct PostDetailCommentThread: View {
    let comment: FeedComment
    let post: FeedPost?
    let postId: String
    let accentColor: String
    let highlightedCommentId: String?
    let onReply: (FeedComment) -> Void
    let onEditComment: (FeedComment) -> Void
    @ObservedObject var viewModel: PostDetailViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var storyViewModel: StoryViewModel

    var body: some View {
        ThreadedCommentSection(
            comment: comment,
            replies: viewModel.repliesFor(comment.id),
            isExpanded: viewModel.expandedThreads.contains(comment.id),
            isLoadingReplies: viewModel.loadingReplies.contains(comment.id),
            accentColor: accentColor, post: post,
            // Like de commentaire optimiste + réaction socket cœur, porté par le
            // ViewModel (miroir de `CommentsSheetView`). L'état est semé depuis
            // `currentUserReactions` au chargement, donc les commentaires déjà
            // likés s'affichent cœur plein et le tap donne un retour instantané.
            likedIds: viewModel.commentLikedIds,
            likeDelta: viewModel.commentLikeDelta,
            heartInFlightIds: viewModel.commentHeartInFlightIds,
            onReply: { target in
                onReply(target)
            },
            onToggleThread: {
                Task { await viewModel.toggleThread(comment.id, postId: postId) }
            },
            onLikeComment: { commentId in
                Task { await viewModel.toggleCommentLike(commentId, postId: postId) }
            },
            onDeleteComment: { target in
                Task { await viewModel.deleteComment(target) }
            },
            onRemoveComment: { target, reason in
                Task { await viewModel.deleteComment(target, reason: reason) }
            },
            onEditComment: { target in onEditComment(target) },
            onRequestTranslation: { target in
                let lang = AuthManager.shared.currentUser?.preferredContentLanguages.first?.lowercased() ?? "fr"
                Task {
                    try? await PostService.shared.requestCommentTranslation(
                        postId: postId, commentId: target.id, targetLanguage: lang)
                }
            },
            moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
            storyState: storyViewModel.storyRingState(forUserId: comment.authorId),
            presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state,
            replyMoodResolver: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
            replyStoryResolver: { storyViewModel.storyRingState(forUserId: $0) },
            replyPresenceResolver: { PresenceManager.shared.presenceMap[$0]?.state },
            hasMoreReplies: viewModel.expandedThreads.contains(comment.id)
                && (viewModel.repliesHasMore[comment.id] ?? false),
            onLoadMoreReplies: { await viewModel.loadMoreReplies(comment.id, postId: postId) },
            highlightedCommentId: highlightedCommentId
        )
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, highlightedCommentId == comment.id ? 6 : 0)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(Color(hex: accentColor).opacity(highlightedCommentId == comment.id ? 0.12 : 0))
                .padding(.horizontal, MeeshySpacing.sm)
        )
        .animation(.easeInOut(duration: 0.4), value: highlightedCommentId)
    }
}
