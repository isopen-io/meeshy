import UIKit
import Combine
import MeeshySDK

final class MessageListViewController: UIViewController {

    enum Section: Hashable { case main }
    enum Item: Hashable { case message(localId: String) }

    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Section, Item>!
    private let store: MessageStore
    private let currentUserId: String
    private let imageCache = DecodedImageCache.shared
    private var cancellables = Set<AnyCancellable>()
    private var isLoadingOlder = false
    var onNewMessagesBadge: ((Int) -> Void)?

    init(store: MessageStore, currentUserId: String) {
        self.store = store
        self.currentUserId = currentUserId
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureCollectionView()
        configureDataSource()
        observeStore()
    }

    // MARK: - CollectionView Setup

    private func configureCollectionView() {
        let layout = UICollectionViewCompositionalLayout { _, _ in
            let itemSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .estimated(60)
            )
            let item = NSCollectionLayoutItem(layoutSize: itemSize)
            let groupSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .estimated(60)
            )
            let group = NSCollectionLayoutGroup.vertical(layoutSize: groupSize, subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            section.interGroupSpacing = 2
            section.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12)
            return section
        }

        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.backgroundColor = .systemBackground
        collectionView.keyboardDismissMode = .interactive
        collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)
        collectionView.delegate = self
        view.addSubview(collectionView)
    }

    // MARK: - DataSource

    private func configureDataSource() {
        let textReg = UICollectionView.CellRegistration<TextBubbleCell, Item> { [weak self] cell, _, item in
            guard let self, case .message(let localId) = item,
                  let record = self.store.message(for: localId) else { return }
            cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
            cell.configure(with: record, isMe: record.senderId == self.currentUserId)
        }

        let mediaReg = UICollectionView.CellRegistration<MediaBubbleCell, Item> { [weak self] cell, _, item in
            guard let self, case .message(let localId) = item,
                  let record = self.store.message(for: localId) else { return }
            cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
            cell.configure(with: record, isMe: record.senderId == self.currentUserId, imageCache: self.imageCache)
        }

        let audioReg = UICollectionView.CellRegistration<AudioBubbleCell, Item> { [weak self] cell, _, item in
            guard let self, case .message(let localId) = item,
                  let record = self.store.message(for: localId) else { return }
            cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
            cell.configure(with: record, isMe: record.senderId == self.currentUserId)
        }

        let systemReg = UICollectionView.CellRegistration<SystemMessageCell, Item> { [weak self] cell, _, item in
            guard let self, case .message(let localId) = item,
                  let record = self.store.message(for: localId) else { return }
            cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
            cell.configure(with: record)
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { [weak self] cv, indexPath, item in
            guard let self, case .message(let localId) = item,
                  let record = self.store.message(for: localId) else {
                return cv.dequeueConfiguredReusableCell(using: textReg, for: indexPath, item: item)
            }
            switch record.contentType {
            case "image", "video":
                return cv.dequeueConfiguredReusableCell(using: mediaReg, for: indexPath, item: item)
            case "audio":
                return cv.dequeueConfiguredReusableCell(using: audioReg, for: indexPath, item: item)
            case "system":
                return cv.dequeueConfiguredReusableCell(using: systemReg, for: indexPath, item: item)
            default:
                return cv.dequeueConfiguredReusableCell(using: textReg, for: indexPath, item: item)
            }
        }
    }

    // MARK: - Snapshot

    private func applySnapshot(animated: Bool = true) {
        var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
        snapshot.appendSections([.main])
        let items = store.messages.reversed().map { Item.message(localId: $0.localId) }
        snapshot.appendItems(items, toSection: .main)
        dataSource.apply(snapshot, animatingDifferences: animated)
    }

    // MARK: - Observation

    private func observeStore() {
        store.messagesDidChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.applySnapshot()
            }
            .store(in: &cancellables)
    }

    // MARK: - Scroll to Bottom

    func scrollToBottom(animated: Bool = true) {
        guard collectionView.numberOfItems(inSection: 0) > 0 else { return }
        collectionView.scrollToItem(at: IndexPath(item: 0, section: 0), at: .top, animated: animated)
    }
}

// MARK: - UICollectionViewDelegate

extension MessageListViewController: UICollectionViewDelegate {
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let offset = scrollView.contentOffset.y
        let contentHeight = scrollView.contentSize.height
        let frameHeight = scrollView.frame.height

        store.isUserScrolling = scrollView.isDragging || scrollView.isDecelerating

        guard contentHeight > frameHeight else { return }
        let distanceFromBottom = contentHeight - offset - frameHeight

        if distanceFromBottom < 300, !isLoadingOlder {
            isLoadingOlder = true
            guard let oldest = store.messages.first?.createdAt else {
                isLoadingOlder = false
                return
            }
            Task { @MainActor in
                _ = await store.loadOlder(before: oldest)
                isLoadingOlder = false
            }
        }
    }
}
