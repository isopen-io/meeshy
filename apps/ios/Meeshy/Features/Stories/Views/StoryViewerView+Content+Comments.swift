import SwiftUI
import MeeshySDK
import MeeshyUI

extension StoryViewerView {

    // MARK: - Comments Overlay (Instagram-style)

    /// Builds the floating comments overlay (`StoryCommentsOverlayView`).
    /// Rendered by `StoryViewerContentView` as a sibling of the story card,
    /// NOT inside it, so the overlay does not inherit the card's drag offset,
    /// scale, or 3D rotation (bug 2026-05-28: overlay shifted left during
    /// drag / scale transitions).
    ///
    /// The overlay carries no composer of its own: its rows' « Répondre »
    /// set the session's reply target, and the main composer — always at the
    /// bottom (`StoryComposerBarView`) — shows the reply banner above its
    /// input row. One comment input zone (spec user 2026-05-28). The thread,
    /// its count and its loads are `StoryCommentSession`'s.
    func storyCommentsOverlay(zone: StoryCommentsZone.Frame) -> StoryCommentsOverlayView {
        let thread = commentSession.thread
        return StoryCommentsOverlayView(
            storyComments: thread.roots,
            storyCommentCount: commentSession.count,
            storyCommentRepliesMap: thread.replies,
            storyCommentExpandedThreads: thread.expandedThreads,
            storyCommentLoadingReplies: thread.loadingReplies,
            storyCommentRepliesHasMore: thread.repliesHasMore,
            isLoadingComments: commentSession.isLoadingRoots,
            readerLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser),
            isStoryExpired: currentStory?.isExpired() ?? false,
            targetCommentId: targetCommentId,
            targetParentCommentId: targetParentCommentId,
            huntTargetComment: {
                await commentSession.huntTarget(Set([targetCommentId, targetParentCommentId].compactMap { $0 }))
            },
            loadMoreStoryCommentReplies: { await commentSession.loadMoreReplies(commentId: $0) },
            revealTargetReply: { parentId, replyId in
                await commentSession.revealReply(parentId: parentId, replyId: replyId)
            },
            showCommentsOverlay: $showCommentsOverlay,
            replyingToStoryComment: $commentSession.replyTarget,
            zone: zone,
            makeStoryCommentRow: makeStoryCommentRow,
            toggleStoryCommentThread: { await commentSession.toggleThread($0) }
        )
    }
}
