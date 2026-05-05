import Foundation

// DiffableDataSource section/item identifier types.
// Defined outside UIViewController to minimize @MainActor inference.
// Note: These still produce Swift 6 strict concurrency errors when used
// with UICollectionViewDiffableDataSource due to a known Swift 6 limitation
// (SR-XXXXX). The fix requires either downgrading to targeted concurrency
// for the Meeshy target or waiting for a Swift compiler fix.

enum MessageListSection: Hashable, Sendable { case main }
enum MessageListItem: Hashable, Sendable { case message(localId: String) }

enum FeedListSection: Hashable, Sendable { case main }
enum FeedListItem: Hashable, Sendable {
    case textPost(id: String)
    case mediaPost(id: String)
}

enum CommentListSection: Hashable, Sendable {
    case topLevel(commentId: String)
}
enum CommentListItem: Hashable, Sendable {
    case comment(id: String)
    case loadMoreReplies(parentId: String, remaining: Int)
}
