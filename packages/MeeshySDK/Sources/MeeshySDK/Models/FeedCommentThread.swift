import Foundation

/// **One comment thread** — the roots and their loaded replies, by parent id —
/// shared by the post sheet, the post detail and the story viewer (#13133).
public struct FeedCommentThread: Sendable {
    public var roots: [FeedComment]
    public var replies: [String: [FeedComment]]

    public init(roots: [FeedComment], replies: [String: [FeedComment]] = [:]) {
        self.roots = roots
        self.replies = replies
    }

    public func replacing(_ edited: FeedComment) -> FeedCommentThread { self }

    public func removing(_ target: FeedComment) -> (thread: FeedCommentThread, removedCount: Int) { (self, 0) }

    public func mergingTranslation(_ text: String, commentId: String, language: String,
                                   preferredLanguages: [String]) -> FeedCommentThread { self }
}
