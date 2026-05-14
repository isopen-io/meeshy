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
    /// Tracks the item count from the last snapshot so we can detect genuinely
    /// new messages (appended at the bottom) vs. older messages (prepended via
    /// pagination). Only new messages bump the unread badge.
    private var previousSnapshotCount: Int = 0
    /// Running counter of messages that arrived while the user was scrolled
    /// away from the bottom. Reset to 0 when the user returns to near-bottom.
    private var pendingUnreadCount: Int = 0
    /// Cached near-bottom state so applySnapshot can decide whether to bump
    /// the unread badge without querying contentOffset mid-layout.
    private var isCurrentlyNearBottom: Bool = true

    // MARK: - Slow scroll for quoted message search

    /// Display link that drives the slow continuous scroll while searching
    /// for a quoted message. We keep the speed at ~80pt/s so the user sees
    /// the messages "flow" past without blur, yet fast enough to feel like
    /// the app is actively searching.
    nonisolated(unsafe) private var slowScrollDisplayLink: CADisplayLink?
    /// Points per second the slow scroll advances toward older messages.
    /// In the inverted layout, increasing `contentOffset.y` scrolls visually
    /// upward (toward older messages).
    private let slowScrollSpeed: CGFloat = 80
    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the scroll position approaches the older-messages
    /// threshold. The parent (typically `ConversationViewModel`) is the
    /// only owner that knows how to chain cache lookup + network fetch
    /// (see `ConversationViewModel.loadOlderMessages`). Going through the
    /// store directly would bypass the network fallback and silently
    /// stall pagination once the local GRDB window is exhausted.
    var onLoadOlder: (() async -> Void)?
    /// Invoked when the scroll position crosses the near-bottom threshold.
    /// Drives the floating "scroll to latest" button in the parent SwiftUI view.
    var onNearBottomChanged: ((Bool) -> Void)?
    /// Invoked when the user taps a story reply preview inside a bubble.
    /// Receives the story id (NOT the message id). Wire to the parent's
    /// story viewer presentation logic.
    var onStoryReplyTap: ((String) -> Void)?
    /// Invoked when the user swipes a bubble far enough to commit a reply
    /// gesture. Receives the message id of the swiped bubble.
    var onSwipeReply: ((String) -> Void)?
    /// Invoked when the user swipes a bubble in the opposite direction
    /// (forward gesture). Receives the message id of the swiped bubble.
    var onSwipeForward: ((String) -> Void)?
    /// Long press on a bubble — opens the contextual options menu.
    var onLongPress: ((String) -> Void)?
    /// Add reaction (typically opens an inline emoji picker).
    var onAddReaction: ((String) -> Void)?
    /// Toggle an existing reaction emoji on a message.
    var onToggleReaction: ((String, String) -> Void)?
    /// Open the full reaction picker / list for a message.
    var onOpenReactPicker: ((String) -> Void)?
    /// Open the detail sheet on the message-info tab.
    var onShowMessageInfo: ((String) -> Void)?
    /// Open the detail sheet on the reactions tab.
    var onShowReactions: ((String) -> Void)?
    /// Open the detail sheet on the language / translation tab.
    var onShowTranslationDetail: ((String) -> Void)?
    /// Tap on a media attachment — typically presents a fullscreen viewer.
    var onMediaTap: ((MessageAttachment) -> Void)?
    /// Consume a view-once message.
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    /// Request an on-demand translation for a message into a target language.
    var onRequestTranslation: ((String, String) -> Void)?
    /// Live source of dynamic per-message data (translations, transcriptions,
    /// audio translations, last-message gating). Held weakly: the cell
    /// registration closure runs on the main runloop alongside the VM, but
    /// the controller is otherwise owned by a SwiftUI `Representable` and
    /// must not retain its parent's state. When nil (deallocating), cells
    /// render with empty translation state — the next `applySnapshot` after
    /// re-attachment will refresh them.
    weak var conversationViewModel: ConversationViewModel?

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

    deinit {
        slowScrollDisplayLink?.invalidate()
        slowScrollDisplayLink = nil
    }

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
            // 12pt horizontal breathing room so bubbles don't kiss the screen edge.
            section.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12)
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
        // Disable native status-bar-tap scroll-to-top: with the inverted
        // transform it would scroll to the newest (visual bottom) instead of
        // the oldest (visual top). We handle status-bar taps manually if needed.
        collectionView.scrollsToTop = false
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

            // Snap dynamic VM-owned state into immutable lets. SwiftUI then
            // sees the bubble depend only on these primitive inputs (Equatable),
            // so VM @Published changes elsewhere don't re-render this cell.
            let vm = self.conversationViewModel
            let translations = vm?.messageTranslations[message.id] ?? []
            let preferred = vm?.preferredTranslation(for: message.id)
            let transcription = vm?.messageTranscriptions[message.id]
            let translatedAudios = vm?.messageTranslatedAudios[message.id] ?? []
            let mentionDisplayNames = vm?.mentionDisplayNames ?? [:]
            let isLastReceived = (vm?.lastReceivedMessageId == message.id)
            let isLastSent = (vm?.lastSentMessageId == message.id)
            let user = AuthManager.shared.currentUser
            let userLanguages: (regional: String?, custom: String?) = (
                user?.regionalLanguage,
                user?.customDestinationLanguage
            )

            // Capture self weakly inside the @Sendable closure passed as
            // ThemedMessageBubble.onReplyTap. The bubble fires it on tap of
            // a reply chip; we forward to the controller's scroll routine.
            let scrollHandler: ((String) -> Void) = { [weak self] targetId in
                self?.scrollToMessage(localId: targetId)
            }
            let storyReplyHandler = self.onStoryReplyTap
            let swipeReplyHandler = self.onSwipeReply
            let swipeForwardHandler = self.onSwipeForward
            let longPressHandler = self.onLongPress
            let addReactionHandler = self.onAddReaction
            let toggleReactionHandler = self.onToggleReaction
            let openReactPickerHandler = self.onOpenReactPicker
            let showInfoHandler = self.onShowMessageInfo
            let showReactionsHandler = self.onShowReactions
            let showTranslationHandler = self.onShowTranslationDetail
            let mediaTapHandler = self.onMediaTap
            let consumeViewOnceHandler = self.onConsumeViewOnce
            let requestTranslationHandler = self.onRequestTranslation
            let messageId = message.id
            let isMine = message.isMe

            // No UIContextMenuInteraction here — the user wants a custom
            // overlay (light blur backdrop, re-rendered bubble centered,
            // compact action menu sliding from the bottom). The native
            // UIMenu can't be styled to match. The long press gesture is
            // owned by the SwiftUI BubbleSwipeContainer and surfaces via
            // `onLongPress` to set ConversationView's overlay state.
            cell.interactions
                .filter { $0 is UIContextMenuInteraction }
                .forEach { cell.removeInteraction($0) }

            cell.contentConfiguration = UIHostingConfiguration {
                BubbleSwipeContainer(
                    isMine: isMine,
                    messageCreatedAt: message.createdAt,
                    onSwipeReply: { swipeReplyHandler?(messageId) },
                    onSwipeForward: { swipeForwardHandler?(messageId) },
                    onLongPress: { longPressHandler?(messageId) }
                ) {
                    ThemedMessageBubble(
                        message: message,
                        contactColor: accent,
                        isDirect: direct,
                        isDark: dark,
                        transcription: transcription,
                        translatedAudios: translatedAudios,
                        textTranslations: translations,
                        preferredTranslation: preferred,
                        showAvatar: !direct,
                        onAddReaction: addReactionHandler,
                        onToggleReaction: { emoji in toggleReactionHandler?(messageId, emoji) },
                        onOpenReactPicker: openReactPickerHandler,
                        onShowInfo: { showInfoHandler?(messageId) },
                        onShowReactions: showReactionsHandler,
                        onReplyTap: scrollHandler,
                        onStoryReplyTap: storyReplyHandler,
                        onMediaTap: mediaTapHandler,
                        onConsumeViewOnce: consumeViewOnceHandler,
                        onRequestTranslation: requestTranslationHandler,
                        onShowTranslationDetail: showTranslationHandler,
                        onScrollToMessage: scrollHandler,
                        isLastInGroup: true,
                        isLastReceivedMessage: isLastReceived,
                        isLastSentMessage: isLastSent,
                        mentionDisplayNames: mentionDisplayNames,
                        currentUserId: myId,
                        userLanguages: userLanguages
                    )
                }
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
        // The diffable datasource only re-runs the cell registration closure
        // when an item's IDENTIFIER changes — we key items by `localId` which
        // stays stable across `.sending → .sent → .delivered`, so without
        // explicitly reconfiguring the rows the bubble would render with its
        // first state forever and only flip after the user leaves and re-opens
        // the conversation (which throws the cells away). `reconfigureItems`
        // forces the registration to re-run for every visible row, picking up
        // GRDB-driven state / content / delivery / reaction changes in place
        // without triggering the costly insert/move/delete diff animation.
        snapshot.reconfigureItems(items)

        // Unread badge: if the snapshot grew at the BOTTOM (new messages, not
        // older pagination) while the user is scrolled away, bump the counter.
        let newCount = items.count
        let delta = newCount - previousSnapshotCount
        if delta > 0, !isCurrentlyNearBottom, !isLoadingOlder, previousSnapshotCount > 0 {
            pendingUnreadCount += delta
            onNewMessagesBadge?(pendingUnreadCount)
        }
        previousSnapshotCount = newCount

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

        // GRDB-driven changes (insert / state transition / delivery / read)
        // already trigger `messagesDidChange` and re-snapshot. But translation
        // / transcription / audio-translation events arrive via Socket.IO
        // and only update `@Published` dictionaries on the ViewModel — they
        // never touch GRDB so the diffable datasource never sees them. Force
        // a snapshot reconfigure when those publishers fire so the cell
        // registration re-runs and `resolveBubbleData` picks the new payload
        // up. Coalesce by 80ms to absorb multilingual bursts (the SDK
        // already collects translation events on that interval, so two
        // collapsed re-snapshots is the worst case).
        guard let vm = conversationViewModel else { return }
        Publishers.MergeMany(
            vm.$messageTranslations.map { _ in () }.eraseToAnyPublisher(),
            vm.$messageTranscriptions.map { _ in () }.eraseToAnyPublisher(),
            vm.$messageTranslatedAudios.map { _ in () }.eraseToAnyPublisher(),
            vm.$activeTranslationOverrides.map { _ in () }.eraseToAnyPublisher()
        )
        .dropFirst() // skip the @Published initial emission
        .debounce(for: .milliseconds(80), scheduler: DispatchQueue.main)
        .sink { [weak self] in
            self?.applySnapshot(animated: false)
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
        // are at most `MessageStore.initialWindowSize` items initially (growing dynamically) so the cost is
        // negligible compared to the layout pass that follows.
        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == localId }
            return false
        }) else { return }

        let indexPath = IndexPath(item: index, section: 0)
        collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)

        flashCell(at: indexPath)
    }

    /// Scrolls fast (no slow-scroll preamble) to a message that was just loaded
    /// from the server after a quoted-message search. Stops any ongoing slow
    /// scroll, then jumps directly to the target with a highlight flash.
    func scrollToMessageFast(localId: String) {
        stopSlowScroll()

        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == localId }
            return false
        }) else { return }

        let indexPath = IndexPath(item: index, section: 0)
        // Use `scrollToItem` with animated: true for a swift but visible scroll.
        collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)

        flashCell(at: indexPath, strong: true)
    }

    // MARK: - Slow Continuous Scroll (Quoted Message Search)

    /// Starts a slow, continuous scroll toward older messages (visually upward).
    /// Used during quoted message search to give the user a visual impression
    /// that the app is actively browsing through message history.
    func startSlowScrollUp() {
        guard slowScrollDisplayLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(slowScrollTick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        slowScrollDisplayLink = link
    }

    /// Stops the slow continuous scroll.
    func stopSlowScroll() {
        slowScrollDisplayLink?.invalidate()
        slowScrollDisplayLink = nil
    }

    @objc private func slowScrollTick(_ displayLink: CADisplayLink) {
        guard let cv = collectionView else {
            stopSlowScroll()
            return
        }
        let dt = displayLink.targetTimestamp - displayLink.timestamp
        let delta = slowScrollSpeed * CGFloat(dt)
        let maxY = cv.contentSize.height - cv.bounds.height + cv.contentInset.bottom
        guard maxY > 0 else { return }
        let newY = min(cv.contentOffset.y + delta, maxY)
        cv.contentOffset.y = newY

        // If we hit the end, trigger pagination so the slow scroll can continue
        // once new older messages are loaded.
        if newY >= maxY - 100, !isLoadingOlder {
            guard !store.messages.isEmpty, let onLoadOlder else { return }
            isLoadingOlder = true
            Task { @MainActor [weak self] in
                defer { self?.isLoadingOlder = false }
                await onLoadOlder()
            }
        }
    }

    // MARK: - Cell Flash Highlight

    /// Briefly flashes a cell so the user spots the target after scroll.
    /// `strong: true` uses a more pronounced effect for the fast-scroll case.
    private func flashCell(at indexPath: IndexPath, strong: Bool = false) {
        let delay: TimeInterval = strong ? 0.25 : 0.35
        let flashAlpha: CGFloat = strong ? 0.2 : 0.4
        let flashDuration: TimeInterval = strong ? 0.15 : 0.18
        let recoverDuration: TimeInterval = strong ? 0.25 : 0.22

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let cell = self?.collectionView.cellForItem(at: indexPath) else { return }
            // Scale bounce for strong flash
            if strong {
                cell.transform = CGAffineTransform(scaleX: 1.02, y: 1.02)
            }
            UIView.animate(withDuration: flashDuration, animations: {
                cell.alpha = flashAlpha
            }) { _ in
                UIView.animate(withDuration: recoverDuration, delay: 0, options: .curveEaseOut) {
                    cell.alpha = 1.0
                    if strong {
                        cell.transform = .identity
                    }
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

        // Near-bottom detection for the floating "scroll to latest" button.
        // In the inverted layout, contentOffset.y ≈ 0 means the user is at
        // the visual bottom (newest messages). A threshold of 200pt gives a
        // comfortable zone before the button appears.
        let nearBottom = offset < 200
        if nearBottom != isCurrentlyNearBottom {
            isCurrentlyNearBottom = nearBottom
            onNearBottomChanged?(nearBottom)
            // Reset unread badge when the user scrolls back to bottom
            if nearBottom && pendingUnreadCount > 0 {
                pendingUnreadCount = 0
                onNewMessagesBadge?(0)
            }
        }

        guard contentHeight > frameHeight else { return }
        let distanceFromBottom = contentHeight - offset - frameHeight

        if distanceFromBottom < 800, !isLoadingOlder {
            // Threshold 800pt ≈ 4–5 screen-heights of messages. Firing early
            // gives the network request time to complete BEFORE the user
            // reaches the edge of loaded content. Combined with the VM's
            // anticipatory prefetch (auto-loads the NEXT page after each page
            // completes), this eliminates the "stall at the top" effect on
            // fast scrolls in large conversations.
            guard !store.messages.isEmpty, let onLoadOlder else { return }
            isLoadingOlder = true
            Task { @MainActor [weak self] in
                defer { self?.isLoadingOlder = false }
                await onLoadOlder()
            }
        }
    }
}
