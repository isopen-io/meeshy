import UIKit

// DiffableDataSource section/item identifier types.
// Must be nonisolated + Sendable for UICollectionViewDiffableDataSource in Swift 6.

nonisolated enum MessageListSection: Hashable, Sendable { case main }
nonisolated enum MessageListItem: Hashable, Sendable {
    case message(localId: String)
    /// Bulle « X écrit… » — vraie cellule, rendue en dernier (bas visuel du
    /// flux inversé). Pas un overlay : un message reçu en direct s'insère
    /// au-dessus d'elle et remonte la conversation naturellement.
    case typingIndicator
    /// Séparateur de jour — pill flottante "Aujourd'hui / Hier / ..." inséré
    /// dans le flux entre deux groupes de messages de dates locales distinctes.
    /// `dayStart` est minuit local de la journée labellisée : il rend l'item
    /// stable pour la diffable datasource (le label exact est recalculé à
    /// l'affichage par la cell registration, qui s'adapte au passage de minuit).
    case dayHeader(dayStart: Date)
}

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
