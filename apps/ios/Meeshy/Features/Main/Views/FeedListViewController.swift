@preconcurrency import UIKit
import Combine
import MeeshySDK

final class FeedListViewController: UIViewController {

    private var collectionView: UICollectionView!
    private var dataSource: FeedListDataSource!
    private let store: FeedStore
    private var cancellables = Set<AnyCancellable>()
    private var isLoadingOlder = false

    init(store: FeedStore) {
        self.store = store
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureCollectionView()
        configureDataSource()
        observeStore()
    }

    private func configureCollectionView() {
        let layout = UICollectionViewCompositionalLayout { _, _ in
            let itemSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .estimated(200)
            )
            let item = NSCollectionLayoutItem(layoutSize: itemSize)
            let groupSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .estimated(200)
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
        let textReg = UICollectionView.CellRegistration<TextPostCell, FeedListItem> { [weak self] cell, _, item in
            guard let self, case .textPost(let id) = item,
                  let idx = self.store.posts.firstIndex(where: { $0.id == id }) else { return }
            cell.configure(with: self.store.posts[idx])
        }

        let mediaReg = UICollectionView.CellRegistration<MediaPostCell, FeedListItem> { [weak self] cell, _, item in
            guard let self, case .mediaPost(let id) = item,
                  let idx = self.store.posts.firstIndex(where: { $0.id == id }) else { return }
            cell.configure(with: self.store.posts[idx])
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { cv, indexPath, item in
            switch item {
            case .textPost:
                return cv.dequeueConfiguredReusableCell(using: textReg, for: indexPath, item: item)
            case .mediaPost:
                return cv.dequeueConfiguredReusableCell(using: mediaReg, for: indexPath, item: item)
            }
        }
    }

    private func applySnapshot(animated: Bool = true) {
        var snapshot = NSDiffableDataSourceSnapshot<FeedListSection, FeedListItem>()
        snapshot.appendSections([.main])
        let items: [FeedListItem] = store.posts.map { post in
            post.mediaJson != nil ? .mediaPost(id: post.id) : .textPost(id: post.id)
        }
        snapshot.appendItems(items, toSection: .main)
        dataSource.apply(snapshot, animatingDifferences: animated)
    }

    private func observeStore() {
        store.postsDidChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.applySnapshot() }
            .store(in: &cancellables)
    }
}

extension FeedListViewController: UICollectionViewDelegate {
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let offset = scrollView.contentOffset.y
        let contentHeight = scrollView.contentSize.height
        let frameHeight = scrollView.frame.height

        guard contentHeight > frameHeight, !isLoadingOlder else { return }
        if offset + frameHeight > contentHeight - 300 {
            isLoadingOlder = true
            Task { @MainActor in
                _ = await store.loadOlder()
                isLoadingOlder = false
            }
        }
    }
}
