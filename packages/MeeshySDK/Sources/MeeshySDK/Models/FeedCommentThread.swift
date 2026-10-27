import Foundation

/// **One comment thread** — the roots and their loaded replies, by parent id —
/// shared by the post sheet, the post detail and the story viewer (#13133).
/// Editing, removing and receiving a translation follow ONE rule per thread,
/// whatever surface shows it.
public struct FeedCommentThread: Sendable {
    public var roots: [FeedComment]
    public var replies: [String: [FeedComment]]

    public init(roots: [FeedComment], replies: [String: [FeedComment]] = [:]) {
        self.roots = roots
        self.replies = replies
    }

    /// Replaces a root or a reply IN PLACE, by id — never inserts.
    public func replacing(_ edited: FeedComment) -> FeedCommentThread {
        updating(commentId: edited.id) { _ in edited }
    }

    /// A root leaves with its replies (the server cascades them); a reply
    /// decrements its parent. `removedCount` is what the entity's counter loses.
    public func removing(_ target: FeedComment) -> (thread: FeedCommentThread, removedCount: Int) {
        guard let parentId = target.parentId else {
            var remaining = replies
            remaining[target.id] = nil
            let thread = FeedCommentThread(roots: roots.filter { $0.id != target.id }, replies: remaining)
            return (thread, 1 + target.replies)
        }
        var remaining = replies
        remaining[parentId] = replies[parentId]?.filter { $0.id != target.id }
        let parents = roots.map { parent -> FeedComment in
            guard parent.id == parentId, parent.replies > 0 else { return parent }
            var decremented = parent
            decremented.replies -= 1
            return decremented
        }
        return (FeedCommentThread(roots: parents, replies: remaining), 1)
    }

    /// A refused optimistic send leaves: only its own row goes (what arrived
    /// by socket or pagination meanwhile stays), and a reply undoes the bump
    /// it gave its parent even when the thread was refetched without it.
    /// `removed` says whether the row was still there.
    public func withdrawingOptimistic(_ id: String, parentId: String?) -> (thread: FeedCommentThread, removed: Bool) {
        guard let parentId else {
            let kept = roots.filter { $0.id != id }
            return (FeedCommentThread(roots: kept, replies: replies), kept.count != roots.count)
        }
        let thread = replies[parentId] ?? []
        let kept = thread.filter { $0.id != id }
        var remaining = replies
        if replies[parentId] != nil { remaining[parentId] = kept }
        let parents = roots.map { parent -> FeedComment in
            guard parent.id == parentId else { return parent }
            var undone = parent
            undone.replies = max(0, parent.replies - 1)
            return undone
        }
        return (FeedCommentThread(roots: parents, replies: remaining), kept.count != thread.count)
    }

    /// A translation that ARRIVED (`comment:translation-updated`) joins the
    /// comment's map and its text re-resolves through the Prism
    /// (`FeedComment.mergingTranslation`), root or reply.
    public func mergingTranslation(_ text: String, commentId: String, language: String,
                                   preferredLanguages: [String]) -> FeedCommentThread {
        updating(commentId: commentId) {
            $0.mergingTranslation(text, language: language, preferredLanguages: preferredLanguages)
        }
    }

    private func updating(commentId: String, _ transform: (FeedComment) -> FeedComment) -> FeedCommentThread {
        if let index = roots.firstIndex(where: { $0.id == commentId }) {
            var updated = roots
            updated[index] = transform(roots[index])
            return FeedCommentThread(roots: updated, replies: replies)
        }
        guard let (parentId, thread) = replies.first(where: { $0.value.contains { $0.id == commentId } }),
              let index = thread.firstIndex(where: { $0.id == commentId })
        else { return self }
        var updatedThread = thread
        updatedThread[index] = transform(thread[index])
        var updatedReplies = replies
        updatedReplies[parentId] = updatedThread
        return FeedCommentThread(roots: roots, replies: updatedReplies)
    }
}
