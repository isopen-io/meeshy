@preconcurrency import UIKit
import Combine
import MeeshySDK

final class CommentListViewController: UIViewController {

    private var collectionView: UICollectionView!
    private var dataSource: CommentListDataSource!
    private let store: CommentStore
    var onToggleThread: ((String) -> Void)?

    init(store: CommentStore) {
        self.store = store
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureCollectionView()
        configureDataSource()
        applySnapshot()
    }

    private func configureCollectionView() {
        let layout = UICollectionViewCompositionalLayout { _, _ in
            let itemSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .estimated(80)
            )
            let item = NSCollectionLayoutItem(layoutSize: itemSize)
            let groupSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .estimated(80)
            )
            let group = NSCollectionLayoutGroup.vertical(layoutSize: groupSize, subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            section.interGroupSpacing = 0
            return section
        }

        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.backgroundColor = .systemBackground
        collectionView.delegate = self
        view.addSubview(collectionView)
    }

    private func configureDataSource() {
        let commentReg = UICollectionView.CellRegistration<TopLevelCommentCell, CommentListItem> { [weak self] cell, _, item in
            guard let self, case .comment(let id) = item,
                  let record = self.store.topLevelComments.first(where: { $0.id == id }) else { return }
            cell.configure(with: record)
        }

        let replyReg = UICollectionView.CellRegistration<ReplyCell, CommentListItem> { [weak self] cell, _, item in
            guard let self, case .comment(let id) = item else { return }
            for parentId in self.store.expandedThreads {
                if let record = self.store.replies(for: parentId).first(where: { $0.id == id }) {
                    cell.configure(with: record, depth: 1)
                    return
                }
            }
        }

        let loadMoreReg = UICollectionView.CellRegistration<LoadMoreRepliesCell, CommentListItem> { cell, _, item in
            guard case .loadMoreReplies(let parentId, let remaining) = item else { return }
            cell.configure(parentId: parentId, remaining: remaining)
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { [weak self] cv, indexPath, item in
            guard let self else {
                return cv.dequeueConfiguredReusableCell(using: commentReg, for: indexPath, item: item)
            }
            switch item {
            case .comment(let id):
                let isReply = self.store.topLevelComments.first(where: { $0.id == id }) == nil
                if isReply {
                    return cv.dequeueConfiguredReusableCell(using: replyReg, for: indexPath, item: item)
                }
                return cv.dequeueConfiguredReusableCell(using: commentReg, for: indexPath, item: item)
            case .loadMoreReplies:
                return cv.dequeueConfiguredReusableCell(using: loadMoreReg, for: indexPath, item: item)
            }
        }
    }

    func applySnapshot(animated: Bool = true) {
        var snapshot = NSDiffableDataSourceSnapshot<CommentListSection, CommentListItem>()
        for comment in store.topLevelComments {
            let section = CommentListSection.topLevel(commentId: comment.id)
            snapshot.appendSections([section])
            snapshot.appendItems([.comment(id: comment.id)], toSection: section)

            let replies = store.replies(for: comment.id)
            if !replies.isEmpty {
                let replyItems = replies.map { CommentListItem.comment(id: $0.id) }
                snapshot.appendItems(replyItems, toSection: section)
            }

            if comment.replyCount > replies.count, store.expandedThreads.contains(comment.id) {
                snapshot.appendItems(
                    [.loadMoreReplies(parentId: comment.id, remaining: comment.replyCount - replies.count)],
                    toSection: section
                )
            }
        }
        dataSource.apply(snapshot, animatingDifferences: animated)
    }
}

extension CommentListViewController: UICollectionViewDelegate {
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        guard let item = dataSource.itemIdentifier(for: indexPath) else { return }
        switch item {
        case .loadMoreReplies(let parentId, _):
            onToggleThread?(parentId)
        default:
            break
        }
    }
}
