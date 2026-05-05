import UIKit

// DiffableDataSource section/item identifier types.
// Must be nonisolated + Sendable for UICollectionViewDiffableDataSource in Swift 6.

nonisolated enum MessageListSection: Hashable, Sendable { case main }
nonisolated enum MessageListItem: Hashable, Sendable { case message(localId: String) }

nonisolated enum FeedListSection: Hashable, Sendable { case main }
nonisolated enum FeedListItem: Hashable, Sendable {
    case textPost(id: String)
    case mediaPost(id: String)
}

nonisolated enum CommentListSection: Hashable, Sendable {
    case topLevel(commentId: String)
}
nonisolated enum CommentListItem: Hashable, Sendable {
    case comment(id: String)
    case loadMoreReplies(parentId: String, remaining: Int)
}

// Type aliases for DiffableDataSource to suppress @MainActor inference
typealias MessageListDataSource = UICollectionViewDiffableDataSource<MessageListSection, MessageListItem>
typealias FeedListDataSource = UICollectionViewDiffableDataSource<FeedListSection, FeedListItem>
typealias CommentListDataSource = UICollectionViewDiffableDataSource<CommentListSection, CommentListItem>
