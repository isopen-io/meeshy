@preconcurrency import UIKit
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

/// Signposts pour profiler les segments CHAUDS du rendu de la liste dans
/// Instruments (track « Points of Interest ») ET via `XCTOSSignpostMetric` dans
/// les tests. Deux intervalles : `applySnapshot` (prépa snapshot O(n) : reversed
/// + map + groupByDay + diff) et `cellConfig` (config PAR cellule : domainMessage
/// + build `BubbleContent` + `UIHostingConfiguration`). Permet de voir EXACTEMENT
/// quel segment du rendu coûte, par device/iOS, sur un scroll réel.
enum PerfSignpost {
    static let signposter = OSSignposter(
        logHandle: OSLog(subsystem: "me.meeshy.app", category: .pointsOfInterest)
    )
}

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
    /// Tracks the item count from the last snapshot so we can detect that the
    /// snapshot grew at all.
    private var previousSnapshotCount: Int = 0
    /// The newest item (index 0 in the inverted layout) from the last snapshot.
    /// A genuinely-new message changes item 0; older-message pagination
    /// prepends to the tail and leaves item 0 untouched. Comparing against
    /// this is deterministic — unlike the `isLoadingOlder` flag, which the
    /// ViewModel's anticipatory prefetch bypasses entirely.
    private var previousNewestItem: MessageListItem?
    /// Running counter of messages that arrived while the user was scrolled
    /// away from the bottom. Reset to 0 when the user returns to near-bottom.
    private var pendingUnreadCount: Int = 0
    /// Cached near-bottom state so applySnapshot can decide whether to bump
    /// the unread badge without querying contentOffset mid-layout.
    private var isCurrentlyNearBottom: Bool = true
    /// Whether the previous snapshot included the typing-indicator cell — lets
    /// the list scroll the indicator into view the moment it first appears.
    private var previouslyShowedTyping: Bool = false

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

    /// Maps each message's gateway-side `serverId` (MongoDB ObjectId) to
    /// the client-side `localId` (UUID) that the diffable datasource uses
    /// as its item identifier. Rebuilt from `store.messages` on every
    /// `applySnapshot`. Consulted by `resolveLocalId(_:)` so the reply-tap
    /// path can find a cited message even when the caller hands us a
    /// server id (which is what `ReplyReference.messageId` carries —
    /// gateway sends `replyTo.id`, not the local UUID).
    private var serverIdToLocalId: [String: String] = [:]
    private var pendingReconfigureMessageIds = Set<String>()
    private var reconfigureDebounceTimer: Timer?

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
    /// Invoked when the user taps the sender avatar's story ring in a bubble
    /// footer. Receives the sender's user id. Wire to the parent's story
    /// viewer presentation logic (singleGroup, first unviewed).
    var onViewSenderStory: ((String) -> Void)?
    /// Invoked when the user swipes a bubble far enough to commit a reply
    /// gesture. Receives the message id of the swiped bubble.
    var onSwipeReply: ((String) -> Void)?
    /// Invoked when the user swipes a bubble in the opposite direction
    /// (forward gesture). Receives the message id of the swiped bubble.
    var onSwipeForward: ((String) -> Void)?
    /// Long press on a bubble — opens the contextual options menu.
    var onLongPress: ((String) -> Void)?
    /// iOS 26+ : builder du contenu `.contextMenu` NATIF (Liquid Glass) d'une
    /// bulle, fourni par `ConversationView`. Quand présent (donc iOS 26+), la
    /// cellule attache le menu natif et DÉSACTIVE le long-press custom.
    var nativeMessageMenu: ((Message) -> AnyView)?
    /// Add reaction. Carries the message id and the tapped bubble cell's
    /// on-screen frame (window coords; `nil` when the cell is not realized)
    /// so the quick-reaction bar can anchor to the bubble.
    var onAddReaction: ((String, CGRect?) -> Void)?
    /// Toggle an existing reaction emoji on a message.
    var onToggleReaction: ((String, String) -> Void)?
    /// BUG2 A' — réaction par-image (attachmentId, messageId, emoji).
    var onReactToAttachment: ((String, String, String) -> Void)?
    /// Open the full reaction picker / list for a message.
    var onOpenReactPicker: ((String) -> Void)?
    /// Open the detail sheet on the message-info tab.
    var onShowMessageInfo: ((String) -> Void)?
    /// Tap on the delivery checkmarks (✓ / ✓✓ / ✓✓ bleu) of a sent message.
    /// Opens the detail sheet on the "vues" tab so the author can inspect who
    /// received / read the message. Only fires for `isMe` messages — received
    /// bubbles never render a delivery check.
    var onShowReadStatus: ((String) -> Void)?
    /// Manual resend of a FAILED outgoing message (id) → `retryMessage`.
    var onRetry: ((String) -> Void)?
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
    /// Tap on a call-summary notice → re-initiate (call back) the same media
    /// type with the conversation peer.
    var onCallBack: ((CallSummaryMetadata) -> Void)?
    /// Long-press on a call-summary notice → request the shared call-detail
    /// sheet (transcript-aware) for that message, via `ConversationView`.
    var onCallDetailRequest: ((String) -> Void)?
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
            stickyDayState.isDark = isDark
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

    /// État réactif de la pill flottante « Aujourd'hui / Hier / … » posée au
    /// top du collectionView. Mis à jour à chaque `scrollViewDidScroll` et
    /// après `applySnapshot` pour que le label suive le message en haut visible.
    private let stickyDayState = MessageDayStickyState()
    private var stickyDayHost: UIHostingController<MessageDayStickyOverlay>?
    /// Dernier item de tête pour lequel la sticky pill a été calculée. Permet
    /// d'éviter le recalcul (résolution `store.message` + `toMessage`) à chaque
    /// frame de `scrollViewDidScroll` tant que la cellule de tête ne change pas.
    private var lastStickyTopItem: MessageListItem?

    override func viewDidLoad() {
        super.viewDidLoad()
        configureCollectionView()
        configureStickyDayOverlay()
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

    private func configureStickyDayOverlay() {
        stickyDayState.isDark = isDark
        let host = UIHostingController(
            rootView: MessageDayStickyOverlay(state: stickyDayState)
        )
        host.view.backgroundColor = .clear
        host.view.isUserInteractionEnabled = false
        addChild(host)
        view.addSubview(host.view)
        host.didMove(toParent: self)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 4),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        stickyDayHost = host
    }

    /// Recalcule le label de la pill sticky à partir de la cellule la plus
    /// haute visuellement. Liste inversée : « plus haute » = plus grand index
    /// dans le snapshot diffable. Si le séparateur natif de ce même jour est
    /// déjà visible, on cache la sticky pour éviter le doublon visuel.
    private func updateStickyDayLabel() {
        guard let dataSource else { return }
        // O(1) : l'item du haut visible = plus grand IndexPath visible, résolu
        // par `itemIdentifier(for:)`. AVANT : `dataSource.snapshot()` copiait
        // TOUT le snapshot (O(n) item identifiers) à CHAQUE frame de scroll —
        // coûteux sur les grandes conversations (jusqu'à 120 fps en ProMotion).
        guard let topIndexPath = collectionView.indexPathsForVisibleItems.max(),
              let topItem = dataSource.itemIdentifier(for: topIndexPath) else {
            lastStickyTopItem = nil
            stickyDayState.label = nil
            return
        }
        // La cellule de tête n'a pas changé depuis le dernier calcul → le label
        // est déjà à jour. Évite un `store.message(for:)` + `toMessage`
        // (jusqu'à 5 décodages JSON) à chaque frame tant qu'on reste dessus.
        guard topItem != lastStickyTopItem else { return }
        lastStickyTopItem = topItem

        let calendar = Calendar.current
        let now = Date()
        let topDayStart: Date?
        switch topItem {
        case .dayHeader:
            // Le séparateur natif est l'item du haut — la sticky doublonnerait,
            // on la masque le temps qu'il défile hors écran.
            stickyDayState.label = nil
            return
        case .message(let localId):
            if let record = store.message(for: localId) {
                // Read `createdAt` straight off the record — `toMessage` decodes
                // five JSON blobs (attachments/reactions/reply/forward/call) and
                // we only need the day. This path runs per top-cell change while
                // scrolling; `toMessage().createdAt` is just `record.createdAt`.
                topDayStart = calendar.startOfDay(for: record.createdAt)
            } else {
                topDayStart = nil
            }
        case .typingIndicator:
            topDayStart = nil
        }
        guard let dayStart = topDayStart else {
            stickyDayState.label = nil
            return
        }
        let label = MessageDayLabel.label(
            for: dayStart,
            now: now,
            calendar: calendar,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
        )
        if stickyDayState.label != label {
            stickyDayState.label = label
        }
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
        // Cells host their SwiftUI content via UIHostingConfiguration
        // (iOS 16+). The message registration reuses the rich SwiftUI bubble
        // shipped before — avatars, sender chrome, accent gradients,
        // translations, reactions, etc. — without manually mirroring its
        // layout in UIKit. The hosting configuration diff-updates on reuse,
        // so scroll performance is preserved.
        // Une registration PAR type d'item (bulle / séparateur de jour /
        // typing). Avec une registration unique, UIKit recyclait une cellule
        // hébergeant un `BubbleSwipeContainer<…>` pour y poser une
        // configuration `MessageDaySeparator` (et inversement) : le hosting
        // content view existant ne supporte pas le nouveau type racine, UIKit
        // détruit et reconstruit la content view à chaque recyclage croisé
        // (warning runtime `UIContentConfigurationAlertForReplacedContentView`,
        // coût visible au scroll). Des registrations distinctes donnent des
        // pools de réutilisation distincts : chaque cellule ne reçoit que des
        // configurations de son propre type racine et se diff-update en place.

        // Typing indicator — vraie cellule (dernière du flux inversé,
        // donc bas visuel). Pas un overlay : un message reçu en direct
        // s'insère au-dessus et remonte la conversation. La bulle anime
        // ses points en autonomie ; le contre-flip annule la transform.
        let typingRegistration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, _ in
            guard let self else {
                cell.contentConfiguration = nil
                return
            }
            let typingNames = self.conversationViewModel?.typingUsernames ?? []
            let typingAccent = self.accentColor
            let typingDark = self.isDark
            cell.contentConfiguration = UIHostingConfiguration {
                TypingIndicatorBubble(names: typingNames, accentHex: typingAccent, isDark: typingDark)
                    .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }

        // Séparateur de jour — pill "Aujourd'hui / Hier / Lundi 9 mai"
        // posée entre deux groupes de messages de jours distincts. Le
        // label est recalculé à chaque rendu de cellule afin de suivre
        // le passage de minuit sans avoir à reconstruire la datasource.
        // Les libellés relatifs sont injectés depuis le catalogue de
        // chaînes localisées pour suivre la langue d'interface de l'app.
        let dayHeaderRegistration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in
            guard let self, case .dayHeader(let dayStart) = item else {
                cell.contentConfiguration = nil
                return
            }
            let label = MessageDayLabel.label(
                for: dayStart,
                now: Date(),
                calendar: .current,
                locale: .current,
                today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
                yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
                dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
            )
            let dark = self.isDark
            cell.contentConfiguration = UIHostingConfiguration {
                MessageDaySeparator(label: label, isDark: dark)
                    .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }

        let messageRegistration = UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in
            guard let self else {
                cell.contentConfiguration = nil
                return
            }
            let _spState = PerfSignpost.signposter.beginInterval("cellConfig")
            defer { PerfSignpost.signposter.endInterval("cellConfig", _spState) }

            guard case .message(let localId) = item,
                  let message = self.store.domainMessage(for: localId, currentUserId: self.currentUserId) else {
                cell.contentConfiguration = nil
                return
            }
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
            // Recipient denominator for the all-or-nothing delivery indicator:
            // active conversation members EXCLUDING me. Prefer the gateway's
            // authoritative per-message `recipientCount` (active participants
            // minus the sender, computed server-side at fetch time); fall back to
            // the local member count only when the server did not provide it
            // (`0` — a socket-origin row or an older payload). Direct chats
            // resolve to 1 (the stored status is trusted verbatim); groups require
            // EVERY recipient before the bubble shows ✓✓ / indigo ✓✓.
            let serverRecipients = message.recipientCount
            let recipients = direct
                ? 1
                : (serverRecipients > 0
                    ? serverRecipients
                    : max(1, (vm?.currentConversation?.memberCount ?? 2) - 1))
            let translations = vm?.messageTranslations[message.id] ?? []
            let preferred = vm?.preferredTranslation(for: message.id)
            let transcription = vm?.messageTranscriptions[message.id]
            let translatedAudios = vm?.messageTranslatedAudios[message.id] ?? []
            // Active in-conversation search term — snapped as a primitive so the
            // Equatable bubble highlights matches in search-filter mode. Nil in
            // normal mode (no highlight). The visible cells reconfigure whenever
            // the filtered message set changes (which always accompanies a query
            // change), so the highlight stays in sync.
            let highlightTerm = vm?.currentSearchQuery
            // Galerie audio plein écran : `AudioFullscreenView` n'affiche son
            // pager que si cette liste est non-vide. Sans ce wiring, le tap
            // sur l'icône / chip plein écran d'une bulle audio ouvre un
            // ZStack contenant uniquement le `Color.black` de fond — d'où
            // l'écran noir observé en prod.
            let allAudioItems = vm?.allAudioItems ?? []
            let mentionDisplayNames = vm?.mentionDisplayNames ?? [:]
            let isLastReceived = (vm?.lastReceivedMessageId == message.id)
            let isLastSent = (vm?.lastSentMessageId == message.id)
            let messageId = message.id
            // Flag-strip language selection — VM-owned (lifted out of the
            // bubble's @State so it flows through the Equatable gate). A tap
            // writes back to the VM, whose publisher triggers a targeted
            // reconfigure of this cell with the fresh snapped values.
            let languageSelection = vm?.bubbleLanguageSelections[messageId]
            let setActiveDisplayLanguage: ((String?) -> Void) = { [weak self] code in
                self?.conversationViewModel?.setBubbleActiveDisplayLanguage(code, for: messageId)
            }
            let setSecondaryLanguage: ((String?) -> Void) = { [weak self] code in
                self?.conversationViewModel?.setBubbleSecondaryLanguage(code, for: messageId)
            }
            // Avatar/name tap → profile deep link. Routed through the
            // controller-held Router so the bubble no longer needs the
            // `@EnvironmentObject Router` that re-rendered every visible
            // bubble on every Router publish.
            let openProfileHandler: ((ProfileSheetUser) -> Void) = { [weak self] user in
                self?.router.deepLinkProfileUser = user
            }
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
            // Wrap the raw handler so each tap also carries the bubble cell's
            // on-screen frame — the quick-reaction bar anchors to it.
            let addReactionHandler: ((String) -> Void) = { [weak self] tappedId in
                guard let self else { return }
                self.onAddReaction?(tappedId, self.cellFrameInWindow(messageId: tappedId))
            }
            let toggleReactionHandler = self.onToggleReaction
            let attachmentReactionHandler = self.onReactToAttachment
            let openReactPickerHandler = self.onOpenReactPicker
            let showInfoHandler = self.onShowMessageInfo
            let showReadStatusHandler = self.onShowReadStatus
            let retryHandler = self.onRetry
            let showReactionsHandler = self.onShowReactions
            let showTranslationHandler = self.onShowTranslationDetail
            let callBackHandler = self.onCallBack
            let callDetailHandler = self.onCallDetailRequest
            let mediaTapHandler = self.onMediaTap
            let consumeViewOnceHandler = self.onConsumeViewOnce
            let requestTranslationHandler = self.onRequestTranslation
            let isMine = message.isMe
            // Anneau story de l'expéditeur — snappé en input primitif comme
            // presence/mood : la cellule ne dépend pas du StoryViewModel, le
            // sink storyGroups (observeStore) reconfigure les cellules
            // visibles quand l'état vu/non-vu change.
            let senderId = message.senderId
            let senderRingState: StoryRingState = isMine
                ? .none
                : stories.storyRingState(forUserId: senderId)
            let viewSenderStoryHandler = self.onViewSenderStory

            // Menu d'appui long — DEUX chemins par version d'OS (miroir des
            // lignes de conversation) :
            // - iOS 26+ : menu contextuel NATIF (Liquid Glass) attaché au
            //   contenu SwiftUI via `.nativeMessageContextMenu`. Le builder
            //   vient de `ConversationView` (toutes les actions y sont déjà
            //   résolues) ; on le fige UNE fois en AnyView stable — précédent
            //   anti-crash EXC_BAD_ACCESS de `ConversationRowItem`.
            // - < iOS 26 : overlay custom (long-press du BubbleSwipeContainer
            //   → `onLongPress` → état d'overlay de ConversationView). Le menu
            //   natif UIMenu ne se style pas comme cet overlay.
            var nativeMenu: (() -> AnyView)? = nil
            if #available(iOS 26.0, *), let builder = self.nativeMessageMenu {
                nativeMenu = { builder(message) }
            }

            // Chemin overlay custom uniquement : retirer toute
            // UIContextMenuInteraction que le système aurait posée. Sur le
            // chemin natif on la GARDE — c'est précisément notre menu.
            if nativeMenu == nil {
                cell.interactions
                    .filter { $0 is UIContextMenuInteraction }
                    .forEach { cell.removeInteraction($0) }
            }

            // Bulles avec piste temporelle (audio/vidéo) → swipe résistant :
            // le curseur de lecture se manipule sans déclencher Répondre/
            // Transférer, sauf swipe horizontal franc (seuil relevé).
            let hasTimebasedMedia = message.attachments.contains {
                AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
            }
            // Bulle construite UNE fois, réutilisée pour le contenu de cellule
            // ET l'aperçu du `.contextMenu` natif (iOS 26) : l'aperçu élevé
            // montre alors la VRAIE bulle/attachement d'origine.
            // (Equatable re-render gate conservé : le @State restant de la bulle
            // vit sur un CHILD du gate stateless, ses invalidations contournent
            // `==` — topologie du `FeedPostCard().equatable()`.)
            let messageBubble = EquatableMessageBubble(bubble: ThemedMessageBubble(
                        message: message,
                        contactColor: accent,
                        recipientCount: recipients,
                        isDirect: direct,
                        isDark: dark,
                        transcription: transcription,
                        translatedAudios: translatedAudios,
                        textTranslations: translations,
                        preferredTranslation: preferred,
                        showAvatar: !direct,
                        senderStoryRingState: senderRingState,
                        onViewStory: (senderRingState != .none)
                            ? { viewSenderStoryHandler?(senderId) }
                            : nil,
                        onAddReaction: addReactionHandler,
                        onToggleReaction: { emoji in toggleReactionHandler?(messageId, emoji) },
                        onOpenReactPicker: openReactPickerHandler,
                        onShowInfo: { showInfoHandler?(messageId) },
                        onShowReactions: showReactionsHandler,
                        onShowReadStatus: showReadStatusHandler,
                        onRetry: retryHandler,
                        onReplyTap: scrollHandler,
                        onStoryReplyTap: storyReplyHandler,
                        onMediaTap: mediaTapHandler,
                        onConsumeViewOnce: consumeViewOnceHandler,
                        onReactToAttachment: { attId, emoji in attachmentReactionHandler?(attId, messageId, emoji) },
                        onRequestTranslation: requestTranslationHandler,
                        onShowTranslationDetail: showTranslationHandler,
                        onPlayAudio: { [weak self] attachmentId in
                            self?.conversationViewModel?.playAudio(attachmentId: attachmentId)
                        },
                        allAudioItems: allAudioItems,
                        onScrollToMessage: scrollHandler,
                        onCallBack: callBackHandler,
                        onLongPressCallDetail: { callDetailHandler?(messageId) },
                        isLastInGroup: true,
                        isLastReceivedMessage: isLastReceived,
                        isLastSentMessage: isLastSent,
                        mentionDisplayNames: mentionDisplayNames,
                        highlightSearchTerm: highlightTerm,
                        currentUserId: myId,
                        userLanguages: userLanguages,
                        activeDisplayLangCode: languageSelection?.activeDisplayLangCode,
                        secondaryLangCode: languageSelection?.secondaryLangCode,
                        onSetActiveDisplayLanguage: setActiveDisplayLanguage,
                        onSetSecondaryLanguage: setSecondaryLanguage,
                        onOpenProfile: openProfileHandler,
                        voiceConsentMissing: vm?.voiceConsentMissing ?? false,
                        onTapConsentNotice: { [weak self] in self?.router.push(.settings) }
                    ))
                    .equatable()
            cell.contentConfiguration = UIHostingConfiguration {
                BubbleSwipeContainer(
                    isMine: isMine,
                    messageId: messageId,
                    messageCreatedAt: message.createdAt,
                    resistance: hasTimebasedMedia ? .resistant : .normal,
                    onSwipeReply: { swipeReplyHandler?(messageId) },
                    onSwipeForward: { swipeForwardHandler?(messageId) },
                    onLongPress: { longPressHandler?(messageId) },
                    // iOS 26+ (menu natif présent) : couper le long-press
                    // custom — le `.contextMenu` natif possède la pression.
                    enableLongPress: nativeMenu == nil
                ) {
                    messageBubble
                }
                .environmentObject(host)
                .environmentObject(stories)
                .environmentObject(statuses)
                .environmentObject(convList)
                // Counter-flip to undo the parent collectionView.transform.
                .scaleEffect(x: 1, y: -1)
                // iOS 26+ : `.contextMenu` NATIF + aperçu = la VRAIE bulle
                // d'origine (réutilisée, remise à l'endroit hors de la
                // collection view inversée). No-op < iOS 26 → overlay custom.
                .nativeMessageContextMenu(menu: nativeMenu) {
                    messageBubble
                        .environmentObject(host)
                        .environmentObject(stories)
                        .environmentObject(statuses)
                        .environmentObject(convList)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 4)
                }
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { cv, indexPath, item in
            switch item {
            case .message:
                return cv.dequeueConfiguredReusableCell(using: messageRegistration, for: indexPath, item: item)
            case .dayHeader:
                return cv.dequeueConfiguredReusableCell(using: dayHeaderRegistration, for: indexPath, item: item)
            case .typingIndicator:
                return cv.dequeueConfiguredReusableCell(using: typingRegistration, for: indexPath, item: item)
            }
        }
    }

    // MARK: - Snapshot

    private func applySnapshot(animated: Bool = true) {
        let _spState = PerfSignpost.signposter.beginInterval("applySnapshot")
        defer { PerfSignpost.signposter.endInterval("applySnapshot", _spState) }
        // Sous-segments pour pinpointer le coût des 75ms mesurés sur device :
        // `snapshot.build` (prépa O(n) : reversed+map+groupByDay+serverId+
        // reconfigure-scan) vs `snapshot.apply` (dataSource.apply = diff +
        // animation + réalisation des cellules). IDs uniques car imbriqués.
        let _buildState = PerfSignpost.signposter.beginInterval("snapshot.build", id: PerfSignpost.signposter.makeSignpostID())
        var snapshot = NSDiffableDataSourceSnapshot<MessageListSection, MessageListItem>()
        snapshot.appendSections([.main])

        // Liste inversée : index 0 = visuel bas (message le plus récent).
        let reversedMessages = Array(store.messages.reversed())
        let messageItems = reversedMessages.map { MessageListItem.message(localId: $0.localId) }

        // Rebuild the serverId → localId map every time we apply a new
        // snapshot. The reply chip in a bubble carries the cited message's
        // SERVER id (gateway sends `replyTo.id` = MongoDB ObjectId), but the
        // diffable datasource items are keyed on the LOCAL id (UUID minted
        // client-side, kept stable across send → ack). Without this map,
        // `scrollToMessage(localId:)` would never find a reply target that
        // wasn't sent during this session — typical for any reply.
        serverIdToLocalId.removeAll(keepingCapacity: true)
        for record in reversedMessages {
            if let serverId = record.serverId, !serverId.isEmpty {
                serverIdToLocalId[serverId] = record.localId
            }
        }

        // Pour chaque groupe de jour on aligne d'abord les messages dans
        // l'ordre du flux puis on pousse le séparateur juste après — qui se
        // retrouve visuellement AU-DESSUS de ses messages, à la WhatsApp.
        // On part de `messageItems` (sans typing) pour pouvoir conserver le
        // count "messages stricts" plus bas, intact des dayHeader insérés.
        let groups = MessageDayGrouping.groupByDay(
            dates: reversedMessages.map(\.createdAt),
            calendar: .current
        )
        var bodyItems: [MessageListItem] = []
        for group in groups {
            for idx in group.indices {
                bodyItems.append(messageItems[idx])
            }
            bodyItems.append(.dayHeader(dayStart: group.dayStart))
        }

        // The typing indicator is a real cell at index 0 — the visual bottom of
        // the inverted layout, just below the newest message. A live message
        // then inserts at index 1 and pushes the conversation up naturally.
        let showTyping = !(conversationViewModel?.typingUsernames.isEmpty ?? true)
        let items: [MessageListItem] = showTyping ? [.typingIndicator] + bodyItems : bodyItems
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
        //
        // CRITICAL: only reconfigure items that ALREADY exist in the applied
        // snapshot. Reconfiguring an identifier that this same apply is also
        // INSERTING is unsupported — UIKit resolves the insert against the new
        // snapshot and the reconfigure against the old one, and the conflicting
        // instructions can drop a freshly-inserted bubble (the new message
        // flashes in then vanishes when the next message triggers the next
        // apply). Inserted items are configured fresh anyway, so excluding them
        // here is both correct and sufficient.
        let previousItems = Set(dataSource.snapshot().itemIdentifiers)
        let itemsToReconfigure = items.filter { previousItems.contains($0) }
        if !itemsToReconfigure.isEmpty {
            snapshot.reconfigureItems(itemsToReconfigure)
        }

        // Detect genuinely-new messages: the MESSAGE count grew AND the newest
        // message changed. Tracking message items only (never the typing cell)
        // means the typing indicator toggling on/off can never be mistaken for
        // a new message nor bump the unread badge. Older-message pagination
        // prepends to the tail and leaves the newest untouched, so it never
        // counts — including the ViewModel's anticipatory prefetch, which
        // loads older pages from an internal Task that bypasses the
        // `isLoadingOlder` flag entirely (the flag is therefore NOT a
        // reliable discriminator). The very first load
        // (previousSnapshotCount == 0) is excluded.
        let newCount = messageItems.count
        let delta = newCount - previousSnapshotCount
        let newestItem = messageItems.first
        let hasGenuinelyNewMessages = delta > 0
            && previousSnapshotCount > 0
            && newestItem != previousNewestItem
        // RC2.1 — when the user is following the conversation (near bottom),
        // auto-scroll onto the new message; otherwise bump the unread badge.
        // The typing cell appearing also auto-scrolls (when near bottom) so it
        // stays visible just below the last message.
        let typingJustAppeared = showTyping && !previouslyShowedTyping
        let shouldAutoScroll = (hasGenuinelyNewMessages || typingJustAppeared) && isCurrentlyNearBottom
        if hasGenuinelyNewMessages && !isCurrentlyNearBottom {
            pendingUnreadCount += delta
            onNewMessagesBadge?(pendingUnreadCount)
        }
        previousSnapshotCount = newCount
        previousNewestItem = newestItem
        previouslyShowedTyping = showTyping

        // Scroll in the apply completion handler so the new item exists in the
        // layout before `scrollToItem` runs (apply is asynchronous for the
        // animated diff path).
        PerfSignpost.signposter.endInterval("snapshot.build", _buildState)
        // N'animer QUE l'insert d'un VRAI nouveau message (petit delta — le joli
        // slide-in) ou l'apparition du typing. Les bulk-loads / refresh / open /
        // state-changes ne s'animent PAS : la trace device (iPhone 16 Pro Max)
        // montre que `dataSource.apply` ANIMÉ est le coût (snapshot.apply = 2136ms
        // sur 17 applies à la navigation) alors que la prépa (`snapshot.build`)
        // ne fait que 5ms. Tuer l'animation des bulk supprime le churn sans
        // perdre le slide d'un message entrant.
        let effectiveAnimated = animated && ((hasGenuinelyNewMessages && delta <= 2) || typingJustAppeared)
        let _applyState = PerfSignpost.signposter.beginInterval("snapshot.apply", id: PerfSignpost.signposter.makeSignpostID())
        dataSource.apply(snapshot, animatingDifferences: effectiveAnimated) { [weak self] in
            PerfSignpost.signposter.endInterval("snapshot.apply", _applyState)
            guard let self else { return }
            // La pill flottante doit refléter le nouveau top du flux dès que
            // les cellules sont en place (insertion d'un nouveau message, etc.).
            self.updateStickyDayLabel()
            if shouldAutoScroll {
                self.scrollToBottom(animated: effectiveAnimated)
            }
        }
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

        observePerMessageDictionary(vm.$messageTranslations, initial: vm.messageTranslations)
        observePerMessageDictionary(vm.$messageTranscriptions, initial: vm.messageTranscriptions)
        observePerMessageDictionary(vm.$messageTranslatedAudios, initial: vm.messageTranslatedAudios)
        observePerMessageDictionary(vm.$activeTranslationOverrides, initial: vm.activeTranslationOverrides)
        // Flag-strip selection lifted out of the bubble's @State — a tap
        // writes to the VM; reconfigure the touched cell so the bubble
        // re-renders with the fresh snapped inputs (the Equatable gate sees
        // them change and lets the body re-run).
        observePerMessageDictionary(vm.$bubbleLanguageSelections, initial: vm.bubbleLanguageSelections)

        vm.$preferredLanguageRevision
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                // Preferred language revision change requires full reconfigure of all items
                self?.applySnapshot(animated: false)
            }
            .store(in: &cancellables)

        vm.$voiceConsentMissing
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(animated: false)
            }
            .store(in: &cancellables)

        // In-conversation search term changes (enter / exit / refine the
        // filtered-conversation search) require re-running the cell registration
        // so each bubble shows or clears the highlight. `applySnapshot`
        // reconfigures every existing item in place — same full-reconfigure
        // pattern as preferredLanguageRevision. The set change on enter/exit
        // already triggers this; the explicit sink also covers a refinement
        // that keeps the same match set but a different term.
        vm.$currentSearchQuery
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(animated: false)
            }
            .store(in: &cancellables)

        // Typing roster — re-snapshot (animated) so the in-flow typing cell
        // inserts / updates / removes fluidly. Low-frequency signal, no debounce.
        // Uses stateStore publisher so typing doesn't trigger full ConversationViewModel re-render.
        vm.typingUsernamesPublisher
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(animated: true)
            }
            .store(in: &cancellables)

        // Anneaux story des avatars expéditeurs — l'état vu/non-vu vit dans
        // StoryViewModel (jamais dans GRDB), donc aucun chemin existant ne
        // reconfigure les cellules quand il change. Fingerprint id:hasUnviewed
        // pour ignorer les mutations sans effet sur l'anneau (compteurs de
        // vues, réactions…) ; la reconfiguration ne touche que les cellules
        // visibles — les autres re-snappent l'état à leur prochaine config.
        storyViewModel.$storyGroups
            .map { groups in
                groups.map { "\($0.id):\($0.hasUnviewed)" }.joined(separator: ",")
            }
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.reconfigureVisibleCells()
            }
            .store(in: &cancellables)
    }

    private func reconfigureVisibleCells() {
        guard let dataSource else { return }
        let visibleItems = collectionView.indexPathsForVisibleItems
            .compactMap { dataSource.itemIdentifier(for: $0) }
        guard !visibleItems.isEmpty else { return }
        var snapshot = dataSource.snapshot()
        let existing = visibleItems.filter { snapshot.indexOfItem($0) != nil }
        guard !existing.isEmpty else { return }
        snapshot.reconfigureItems(existing)
        dataSource.apply(snapshot, animatingDifferences: false)
    }

    /// Diffe un dictionnaire `[messageId: Value]` publié par le ViewModel et
    /// queue un reconfigure ciblé pour chaque clé dont la valeur a changé ou
    /// disparu. Mutualise les cinq flux de métadonnées par message
    /// (traductions, transcriptions, audios traduits, overrides, sélection
    /// drapeaux) — avant, chaque flux dupliquait ce diff sur 18 lignes avec
    /// sa propre propriété `lastX`. Le snapshot précédent vit dans la closure
    /// (capture `var`), le sink s'exécute sur le main via `receive(on:)`.
    private func observePerMessageDictionary<Value: Equatable>(
        _ publisher: Published<[String: Value]>.Publisher,
        initial: [String: Value]
    ) {
        var last = initial
        publisher
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] new in
                guard let self else { return }
                var changed: Set<String> = []
                for (msgId, val) in new where last[msgId] != val {
                    changed.insert(msgId)
                }
                for msgId in last.keys where new[msgId] == nil {
                    changed.insert(msgId)
                }
                last = new
                self.queueReconfigure(for: changed)
            }
            .store(in: &cancellables)
    }

    private func queueReconfigure(for messageIds: Set<String>) {
        guard !messageIds.isEmpty else { return }
        pendingReconfigureMessageIds.formUnion(messageIds)

        reconfigureDebounceTimer?.invalidate()
        reconfigureDebounceTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                let ids = self.pendingReconfigureMessageIds
                self.pendingReconfigureMessageIds.removeAll()
                self.reconfigureMessages(serverIds: ids)
            }
        }
    }

    private func reconfigureMessages(serverIds: Set<String>) {
        guard let dataSource = dataSource, !serverIds.isEmpty else { return }

        // Translation/transcription events key by server id; the flag-strip
        // selection keys by `message.id`, which IS the local id for a not-yet
        // acked optimistic row. Fall back to the raw key — non-existent items
        // are filtered against the snapshot below anyway.
        let localIds = serverIds.map { self.serverIdToLocalId[$0] ?? $0 }
        guard !localIds.isEmpty else { return }

        var snapshot = dataSource.snapshot()
        let itemsToReconfigure = localIds.map { MessageListItem.message(localId: $0) }

        // Only reconfigure items that actually exist in the current snapshot
        let existingItems = itemsToReconfigure.filter { snapshot.indexOfItem($0) != nil }
        guard !existingItems.isEmpty else { return }

        snapshot.reconfigureItems(existingItems)
        dataSource.apply(snapshot, animatingDifferences: false)
    }

    // MARK: - Scroll to Bottom

    func scrollToBottom(animated: Bool = true) {
        guard collectionView.numberOfItems(inSection: 0) > 0 else { return }
        collectionView.scrollToItem(at: IndexPath(item: 0, section: 0), at: .top, animated: animated)
        // RC2.4 — a programmatic scroll does not reliably fire
        // `scrollViewDidScroll` (no drag/decelerate phase), so the near-bottom
        // state and the unread badge must be resynced here. Without this the
        // NEXT `applySnapshot` re-bumps the badge against a stale
        // `isCurrentlyNearBottom`, and the badge never reliably clears.
        if !isCurrentlyNearBottom {
            isCurrentlyNearBottom = true
            onNearBottomChanged?(true)
        }
        if pendingUnreadCount > 0 {
            pendingUnreadCount = 0
            onNewMessagesBadge?(0)
        }
    }

    // MARK: - Scroll to specific message (reply chip tap)

    /// Locates `localId` in the current snapshot and scrolls it into view,
    /// then briefly flashes the cell so the user can find it. Called by the
    /// reply-chip tap inside `ThemedMessageBubble`. Forwards to the SwiftUI
    /// `onScrollToMessage` closure so the parent ConversationViewModel can
    /// also load older messages if the target lives outside the current
    /// window.
    /// Resolves a message id — either a local UUID or a gateway-issued
    /// server id — to the local UUID used by the diffable datasource. The
    /// snapshot items are keyed on `localId`; reply chips pass the server
    /// id; this method bridges the two without forcing every call site
    /// to remember which kind it has.
    private func resolveLocalId(_ id: String) -> String {
        // Most call sites pass a localId already (e.g. the typing → message
        // glue, the scroll-to-bottom action). Look it up via the
        // server-side map only when we don't already match an item key —
        // saves a dict probe on the hot scroll-to-bottom path.
        serverIdToLocalId[id] ?? id
    }

    func scrollToMessage(localId: String) {
        // Forward to parent first — if the message lives outside the current
        // window, the parent ViewModel will trigger a `loadWindow(around:)`
        // which repopulates the store. The store observer reapplies the
        // snapshot, then this method runs again with the message visible.
        Logger.messages.debug("scrollToMessage requested target=\(localId, privacy: .public)")
        onScrollToMessage?(localId)

        // Reply chips pass the citation's SERVER id; the snapshot uses
        // LOCAL ids. Translate before the lookup so any message in the
        // current window is reachable, regardless of which id flavour the
        // caller has.
        let resolvedId = resolveLocalId(localId)

        // Items are inserted reversed (newest first) for the inverted
        // collection view. Locate by linear scan over the snapshot — there
        // are at most `MessageStore.initialWindowSize` items initially (growing dynamically) so the cost is
        // negligible compared to the layout pass that follows.
        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else {
            // Not in the current snapshot — `onScrollToMessage` was just
            // asked to load it. When the store observer reapplies the
            // snapshot, the second pass through `scrollToMessage` (driven
            // by `scrollState.scrollToMessageId`) will find it. If it
            // doesn't, the log below will show the gap during diagnostic.
            Logger.messages.debug("scrollToMessage target=\(localId, privacy: .public) NOT in snapshot — relying on parent jump path")
            return
        }

        let indexPath = IndexPath(item: index, section: 0)
        collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)

        flashCell(at: indexPath)
    }

    /// Scrolls fast (no slow-scroll preamble) to a message that was just loaded
    /// from the server after a quoted-message search. Stops any ongoing slow
    /// scroll, then jumps directly to the target with a highlight flash.
    func scrollToMessageFast(localId: String) {
        stopSlowScroll()

        // Same id-flavour bridge as `scrollToMessage` — see
        // `resolveLocalId(_:)` for the rationale.
        let resolvedId = resolveLocalId(localId)

        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else { return }

        let indexPath = IndexPath(item: index, section: 0)
        // Use `scrollToItem` with animated: true for a swift but visible scroll.
        collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)

        flashCell(at: indexPath, strong: true)
    }

    // MARK: - Cell Frame Lookup

    /// On-screen frame (window coordinates) of the realized cell hosting
    /// `messageId`, or `nil` when that cell is not currently visible.
    /// `convert(_:to: nil)` resolves the collection view's inverted-axis
    /// transform, so the returned rect is the upright frame the user sees.
    /// Used to anchor the floating quick-reaction bar to the tapped bubble.
    func cellFrameInWindow(messageId: String) -> CGRect? {
        // Quick-reaction bar anchors on a tap by id — same server/local
        // id-flavour bridge as the scroll routines.
        let resolvedId = resolveLocalId(messageId)
        let snapshot = dataSource.snapshot()
        guard let index = snapshot.itemIdentifiers.firstIndex(where: {
            if case .message(let id) = $0 { return id == resolvedId }
            return false
        }) else { return nil }
        guard let cell = collectionView.cellForItem(at: IndexPath(item: index, section: 0)) else {
            return nil
        }
        return cell.convert(cell.bounds, to: nil)
    }

    // MARK: - Slow Continuous Scroll (Quoted Message Search)

    /// Starts a slow, continuous scroll toward older messages (visually upward).
    /// Used during quoted message search to give the user a visual impression
    /// that the app is actively browsing through message history.
    func startSlowScrollUp() {
        guard slowScrollDisplayLink == nil else { return }
        // Proxy weak partagé (WeakDisplayLinkTarget) : un link `target: self`
        // retenait le VC entier (run loop → link → VC, deinit inatteignable)
        // quand on quittait la conversation pendant une recherche de message
        // cité — tick 60-120 fps + paginations réseau pour un écran mort.
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.slowScrollTick(link)
        }
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

        // Met à jour le label de la pill flottante en fonction du message
        // en haut visible. Léger : un lookup de l'item à l'index max + une
        // string formatée. Aucune allocation inutile si le label ne change pas.
        updateStickyDayLabel()

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

// MARK: - Typing Indicator Cell

/// Bulle « X écrit… » rendue comme dernière cellule du flux de messages
/// (bas visuel de la liste inversée). Alignée côté expéditeur ; les points
/// s'animent en autonomie via `@State` (pas de timer externe).
private struct TypingIndicatorBubble: View {
    let names: [String]
    let accentHex: String
    let isDark: Bool

    @State private var animating = false

    private var label: String {
        switch names.count {
        case 0: return ""
        case 1: return String(format: String(localized: "typing.named", bundle: .main), names[0])
        case 2: return String(format: String(localized: "typing.double", bundle: .main), names[0], names[1])
        default: return String(localized: "typing.several", bundle: .main)
        }
    }

    var body: some View {
        let accent = Color(hex: accentHex)
        HStack(spacing: 0) {
            HStack(spacing: 6) {
                if !label.isEmpty {
                    Text(label)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(isDark ? accent.opacity(0.85) : accent.opacity(0.7))
                        .lineLimit(1)
                }
                HStack(spacing: 3) {
                    ForEach(0..<3, id: \.self) { i in
                        Circle()
                            .fill(accent)
                            .frame(width: 5, height: 5)
                            .scaleEffect(animating ? 1.0 : 0.5)
                            .opacity(animating ? 1.0 : 0.4)
                            .animation(
                                .easeInOut(duration: 0.5)
                                    .repeatForever(autoreverses: true)
                                    .delay(Double(i) * 0.18),
                                value: animating
                            )
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Capsule().fill(isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.05)))
            .overlay(Capsule().strokeBorder(accent.opacity(isDark ? 0.25 : 0.18), lineWidth: 1))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .onAppear { animating = true }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }
}
