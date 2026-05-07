@preconcurrency import UIKit
import SwiftUI
import Combine
import MeeshySDK

final class MessageListViewController: UIViewController {

    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<MessageListSection, MessageListItem>!
    private let store: MessageStore
    private let currentUserId: String
    private var accentColor: String
    private let isDirect: Bool
    private var isDark: Bool
    private let router: Router
    private let storyViewModel: StoryViewModel
    private let statusViewModel: StatusViewModel
    private let conversationListViewModel: ConversationListViewModel
    private var cancellables = Set<AnyCancellable>()
    private var isLoadingOlder = false
    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the scroll position approaches the older-messages
    /// threshold. The parent (typically `ConversationViewModel`) is the
    /// only owner that knows how to chain cache lookup + network fetch
    /// (see `ConversationViewModel.loadOlderMessages`). Going through the
    /// store directly would bypass the network fallback and silently
    /// stall pagination once the local GRDB window is exhausted.
    var onLoadOlder: (() async -> Void)?
    var resolveBubbleData: (String) -> MessageBubbleData = { _ in MessageBubbleData() }

    init(
        store: MessageStore,
        currentUserId: String,
        accentColor: String,
        isDirect: Bool,
        isDark: Bool,
        router: Router,
        storyViewModel: StoryViewModel,
        statusViewModel: StatusViewModel,
        conversationListViewModel: ConversationListViewModel
    ) {
        self.store = store
        self.currentUserId = currentUserId
        self.accentColor = accentColor
        self.isDirect = isDirect
        self.isDark = isDark
        self.router = router
        self.storyViewModel = storyViewModel
        self.statusViewModel = statusViewModel
        self.conversationListViewModel = conversationListViewModel
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    func update(isDark: Bool, accentColor: String) {
        var changed = false
        if self.isDark != isDark { self.isDark = isDark; changed = true }
        if self.accentColor != accentColor { self.accentColor = accentColor; changed = true }
        if changed {
            applySnapshot(animated: false)
        }
    }

    /// Reserves vertical clearance at the visual bottom of the list. Because
    /// the collection view is transformed with `scaleY: -1`, what looks like
    /// the bottom on screen is `contentInset.top` in the underlying scroll
    /// view's coordinate space. Same flip applies to the scroll indicator
    /// inset so the bar isn't hidden under the composer.
    func applyBottomInset(_ inset: CGFloat) {
        guard collectionView != nil else { return }
        if collectionView.contentInset.top != inset {
            collectionView.contentInset.top = inset
            collectionView.verticalScrollIndicatorInsets.top = inset
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureCollectionView()
        configureDataSource()
        observeStore()
        // Apply the initial snapshot from whatever the store already holds.
        // The store's `messagesDidChange` PassthroughSubject is fire-and-forget:
        // any emission that happened before this VC subscribed is lost. The
        // ViewModel typically populates the store via `loadInitial()` from its
        // own `init`, which runs BEFORE `viewDidLoad`, so the first refresh
        // emission is missed and the list would render empty even though
        // `store.messages` is non-empty.
        applySnapshot(animated: false)
    }

    // MARK: - CollectionView Setup

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
            section.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0)
            return section
        }

        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.backgroundColor = .clear
        collectionView.keyboardDismissMode = .interactive
        // Inverted axis: newest messages appear at the bottom while data flows
        // from top of the array. The cell's contentView is counter-flipped in
        // the SwiftUI host so visual content stays right-side-up.
        collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)
        collectionView.delegate = self
        view.addSubview(collectionView)
    }

    // MARK: - DataSource

    private func configureDataSource() {
        // Single registration that hosts the SwiftUI ThemedMessageBubble inside
        // the cell via UIHostingConfiguration (iOS 16+). Reuses the rich SwiftUI
        // bubble shipped before — avatars, sender chrome, accent gradients,
        // translations, reactions, etc. — without manually mirroring its layout
        // in UIKit. The hosting configuration diff-updates on reuse, so scroll
        // performance is preserved.
        let registration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in
            guard let self,
                  case .message(let localId) = item,
                  let record = self.store.message(for: localId) else {
                cell.contentConfiguration = nil
                return
            }
            let message = record.toMessage(currentUserId: self.currentUserId)
            let accent = self.accentColor
            let dark = self.isDark
            let direct = self.isDirect
            let myId = self.currentUserId
            let host = self.router
            let stories = self.storyViewModel
            let statuses = self.statusViewModel
            let convList = self.conversationListViewModel
            let bubbleData = self.resolveBubbleData(message.id)

            // Capture self weakly inside the @Sendable closure passed as
            // ThemedMessageBubble.onReplyTap. The bubble fires it on tap of
            // a reply chip; we forward to the controller's scroll routine.
            let scrollHandler: ((String) -> Void) = { [weak self] targetId in
                self?.scrollToMessage(localId: targetId)
            }

            cell.contentConfiguration = UIHostingConfiguration {
                ThemedMessageBubble(
                    message: message,
                    contactColor: accent,
                    isDirect: direct,
                    isDark: dark,
                    transcription: bubbleData.transcription,
                    translatedAudios: bubbleData.translatedAudios,
                    textTranslations: bubbleData.translations,
                    preferredTranslation: bubbleData.preferredTranslation,
                    showAvatar: !direct,
                    onReplyTap: scrollHandler,
                    onScrollToMessage: scrollHandler,
                    isLastInGroup: true,
                    mentionDisplayNames: bubbleData.mentionDisplayNames,
                    currentUserId: myId,
                    userLanguages: bubbleData.userLanguages
                )
                .environmentObject(host)
                .environmentObject(stories)
                .environmentObject(statuses)
                .environmentObject(convList)
                // Counter-flip to undo the parent collectionView.transform.
                .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { cv, indexPath, item in
            cv.dequeueConfiguredReusableCell(using: registration, for: indexPath, item: item)
        }
    }

    // MARK: - Snapshot

    private func applySnapshot(animated: Bool = true) {
        var snapshot = NSDiffableDataSourceSnapshot<MessageListSection, MessageListItem>()
        snapshot.appendSections([.main])
        let items = store.messages.reversed().map { MessageListItem.message(localId: $0.localId) }
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

    // MARK: - Scroll to specific message (reply chip tap)

    /// Locates `localId` in the current snapshot and scrolls it into view,
    /// then briefly flashes the cell so the user can find it. Called by the
    /// reply-chip tap inside `ThemedMessageBubble`. Forwards to the SwiftUI
    /// `onScrollToMessage` closure so the parent ConversationViewModel can
    /// also load older messages if the target lives outside the current
    /// window.
    func scrollToMessage(localId: String) {
        // Forward to parent first — if the message lives outside the current
        // window, the parent ViewModel will trigger a `loadWindow(around:)`
        // which repopulates the store. The store observer reapplies the
        // snapshot, then this method runs again with the message visible.
        onScrollToMessage?(localId)

        // Items are inserted reversed (newest first) for the inverted
        // collection view. Locate by linear scan over the snapshot — there
        // are at most `MessageStore.windowSize` items so the cost is
        // negligible compared to the layout pass that follows.
        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == localId }
            return false
        }) else { return }

        let indexPath = IndexPath(item: index, section: 0)
        collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)

        // Brief flash so the user spots the target after the scroll lands.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            guard let cell = self?.collectionView.cellForItem(at: indexPath) else { return }
            UIView.animate(withDuration: 0.18, animations: {
                cell.alpha = 0.4
            }) { _ in
                UIView.animate(withDuration: 0.22) {
                    cell.alpha = 1.0
                }
            }
        }
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
            // The collection view is `scaleY: -1` flipped, so what looks like
            // the visual top (older messages) lives at the data tail. Approaching
            // `distanceFromBottom < 300` means the user is scrolling toward the
            // older end. Hand off to `onLoadOlder` (wired to the ViewModel) so
            // pagination tries cache first, then network — the store-only path
            // would stall once GRDB has no more rows.
            guard !store.messages.isEmpty, let onLoadOlder else { return }
            isLoadingOlder = true
            Task { @MainActor [weak self] in
                await onLoadOlder()
                self?.isLoadingOlder = false
            }
        }
    }
}
