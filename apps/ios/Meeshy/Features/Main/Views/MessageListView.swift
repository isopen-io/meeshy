import SwiftUI
import MeeshySDK
import MeeshyUI

/// Wraps a bubble with a horizontal swipe gesture that fires either a reply
/// or forward action. Restored from the pre-bubble-decompose `+MessageRow`
/// SwiftUI list layout — the new UICollectionView host (MessageListViewController)
/// no longer carries the legacy gesture, so any cell that wants swipe support
/// must opt in via this container.
///
/// Swipe direction follows the same convention as the original list:
/// `replyDirection = isMine ? -1 : +1`. Reply lives on the side that
/// "points back" at the sender (right for received, left for sent), and
/// forward sits on the opposite side.
///
/// State is local to the container — each cell owns its own offset,
/// so reuse never leaks the in-flight drag of a previous row. The drag
/// commits at ~92% of the action zone (≥66pt out of 72pt) with rubber
/// banding past the zone (15% resistance) and haptic feedback at commit.
struct BubbleSwipeContainer<Content: View>: View {
    let isMine: Bool
    /// Identifier published via `MessageFramePreferenceKey` so the long-press
    /// overlay can locate this cell's screen frame at gesture fire time.
    let messageId: String
    /// Used by the swipe indicator to display a "day month / hh:mm" stamp
    /// before the user has dragged past the reply threshold.
    let messageCreatedAt: Date
    /// `true` while the long-press overlay is presenting this exact cell —
    /// the live row fades to `opacity: 0` so only the elevated copy in the
    /// overlay is visible. Frame publication continues so the overlay can
    /// keep the bubble pinned to its real position.
    var isHiddenForOverlay: Bool = false
    /// Résistance du swipe latéral selon le type de contenu. `.resistant`
    /// (audio/vidéo) relève le seuil pour ne pas gêner le scrubber de lecture.
    var resistance: SwipeResistance = .normal
    /// `true` pendant que l'utilisateur manipule le curseur de lecture d'un
    /// média : le swipe s'efface pour laisser le scrubbing prioritaire.
    var isScrubbing: Bool = false
    let onSwipeReply: () -> Void
    let onSwipeForward: () -> Void
    /// Long press triggers the message's contextual options (reply, forward,
    /// reactions, copy, delete, …). The container fires the haptic so each
    /// caller doesn't have to.
    let onLongPress: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var offset: CGFloat = 0
    @State private var didCrossThreshold: Bool = false

    private var replyDirection: CGFloat { isMine ? -1 : 1 }

    // Pre-formatted on `messageCreatedAt` (a `let`) so the indicator's body
    // re-evaluation during drag doesn't re-run `Date.formatted` 60 times per
    // second. SwiftUI doesn't track these as dependencies (they're computed
    // from a stable input), so they're effectively memoized for the cell's
    // lifetime.
    private var swipeStampDay: String {
        messageCreatedAt.formatted(.dateTime.day().month(.abbreviated))
    }
    private var swipeStampTime: String {
        messageCreatedAt.formatted(.dateTime.hour().minute())
    }

    var body: some View {
        // ZStack stacks the (small, edge-pinned) swipe indicator BEHIND the
        // bubble. The bubble starts on top of the indicator; as the drag
        // grows, `.offset(x:)` slides the bubble away and the indicator
        // becomes visible in the freed-up gap. Same pattern as iMessage —
        // indicator never participates in layout sizing, so the cell still
        // adapts to the bubble's intrinsic width.
        ZStack(alignment: isMine ? .trailing : .leading) {
            swipeIndicator
                .padding(.horizontal, 8)

            content()
                .offset(x: offset)
                .accessibilityAction(named: String(localized: "a11y.message.actions.reply", bundle: .main)) { onSwipeReply() }
                .accessibilityAction(named: String(localized: "a11y.message.actions.forward", bundle: .main)) { onSwipeForward() }
                .accessibilityAction(named: String(localized: "a11y.message.actions.long_press", bundle: .main)) { onLongPress() }
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: MessageFramePreferenceKey.self,
                            value: [messageId: proxy.frame(in: .global)]
                        )
                    }
                )
                .opacity(isHiddenForOverlay ? 0 : 1)
                .animation(BubbleAnimations.overlayRevealCrossfade, value: isHiddenForOverlay)
                .simultaneousGesture(dragGesture)
                // Long press surfaces via `simultaneousGesture` so it
                // cooperates with the inner reaction "+" tap. The parent
                // (ConversationView) renders a custom overlay that keeps
                // the bubble at its source position (looked up via
                // MessageFramePreferenceKey above), with adaptive lift
                // and a compact action menu — that's what `onLongPress`
                // is wired to. Duration tightened from 0.45 → 0.35 to
                // match iMessage/WhatsApp reactivity.
                //
                // `maximumDistance: 6` (default 10) : on rétrécit la
                // fenêtre de tolérance du long press pour que dès que le
                // doigt bouge de 6pt — ce qui suffit largement à
                // déclencher un scroll vertical sur UICollectionView —
                // le LongPressGesture s'annule et laisse le pan parent
                // s'approprier le geste sans aucune contention. Le
                // scroll est ainsi prioritaire sur le long press.
                .simultaneousGesture(
                    LongPressGesture(minimumDuration: 0.35, maximumDistance: 6)
                        .onEnded { _ in
                            HapticFeedback.medium()
                            onLongPress()
                        }
                )
        }
    }

    @ViewBuilder
    private var swipeIndicator: some View {
        let directed = offset * replyDirection
        let isReplyDir = directed > 0
        let isOverThreshold = abs(offset) >= 66
        let visibility = min(1.0, abs(offset) / 24.0)

        if abs(offset) > 8 {
            ZStack {
                if isOverThreshold {
                    // Past the commit threshold — the action icon REPLACES
                    // the date stamp. Reply (curved arrow back) for reply
                    // direction, forward (curved arrow forward) for the
                    // opposite. Crossfade transition keeps the swap subtle.
                    Image(systemName: isReplyDir ? "arrowshape.turn.up.left.fill" : "arrowshape.turn.up.right.fill")
                        .font(MeeshyFont.relative(22, weight: .semibold))
                        .foregroundStyle(MeeshyColors.brandPrimary)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    // Under the threshold — day + hour stamp gives the user
                    // context (when the message was sent) while they decide
                    // whether to commit the gesture.
                    VStack(spacing: 2) {
                        Text(swipeStampDay)
                            .font(MeeshyFont.relative(11, weight: .medium))
                        Text(swipeStampTime)
                            .font(MeeshyFont.relative(12, weight: .semibold))
                    }
                    .foregroundColor(.secondary)
                    .transition(.opacity)
                }
            }
            .frame(width: 64)
            .opacity(visibility)
            .animation(.easeInOut(duration: 0.15), value: isOverThreshold)
        }
    }

    private var dragGesture: some Gesture {
        // `minimumDistance: 22` (avant 15) : on élargit la fenêtre
        // pendant laquelle le pan UICollectionView a priorité exclusive
        // sur le swipe horizontal de la bulle. Tant que le doigt n'a
        // pas parcouru 22pt, AUCUN événement n'arrive à ce gesture —
        // le scroll vertical peut donc démarrer instantanément sans
        // contention. 22pt reste largement en-dessous d'un swipe
        // horizontal réel (~60-100pt), donc reply/forward continuent
        // de répondre normalement.
        DragGesture(minimumDistance: BubbleSwipeResistance.minimumDistance(resistance))
            .onChanged { value in
                let h = value.translation.width
                // Décision d'engagement centralisée dans la logique pure
                // `BubbleSwipeResistance` (testée) : dominance horizontale +
                // seuil selon la résistance, et abandon total pendant un
                // scrubbing média. En `.normal` : 3:1 / 22pt (comportement
                // historique). En `.resistant` : 4:1 / 48pt + priorité scrubber.
                guard BubbleSwipeResistance.shouldEngage(
                    translationWidth: h,
                    translationHeight: value.translation.height,
                    isScrubbing: isScrubbing,
                    resistance: resistance
                ) else { return }
                let zone: CGFloat = 72
                let absH = abs(h)
                let sign: CGFloat = h > 0 ? 1 : -1
                if absH > zone {
                    offset = sign * (zone + (absH - zone) * 0.15)
                } else {
                    offset = h
                }
                // Light haptic the moment we cross the commit threshold
                // (and only once per drag) so the user feels the bubble
                // "snap" into the action zone before they let go.
                let crossed = abs(offset) >= 66
                if crossed && !didCrossThreshold {
                    didCrossThreshold = true
                    HapticFeedback.light()
                } else if !crossed && didCrossThreshold {
                    didCrossThreshold = false
                }
            }
            .onEnded { _ in
                let directed = offset * replyDirection
                if directed >= 66 {
                    onSwipeReply()
                    HapticFeedback.success()
                } else if directed <= -66 {
                    onSwipeForward()
                    HapticFeedback.success()
                }
                didCrossThreshold = false
                withAnimation(.spring(response: 0.42, dampingFraction: 0.62, blendDuration: 0.04)) {
                    offset = 0
                }
            }
    }
}


struct MessageListView: UIViewControllerRepresentable {
    let store: MessageStore
    /// Owner of the live per-message dynamic state (translations,
    /// transcriptions, audio translations, last-message gating). Held weakly
    /// by the underlying controller; the controller snaps required values
    /// into immutable `let`s at cell-config time so SwiftUI doesn't observe
    /// the VM directly from inside cells.
    let conversationViewModel: ConversationViewModel
    let currentUserId: String
    let accentColor: String
    let isDirect: Bool
    /// Vertical clearance reserved at the bottom of the list so the latest
    /// message is never hidden behind the composer/keyboard.
    /// Pass the composer height here.
    var bottomInset: CGFloat = 0
    /// Incremented from the parent SwiftUI view when the "scroll to latest"
    /// button is tapped. The bridge compares old vs. new to fire scrollToBottom.
    var scrollToBottomTrigger: Int = 0
    /// Set by the parent when a quoted message has been loaded from the server
    /// and the VC needs to scroll to it. Pair with `scrollToMessageTrigger`
    /// (counter) so the bridge detects each distinct request.
    var scrollToMessageId: String? = nil
    var scrollToMessageTrigger: Int = 0
    /// True while the ViewModel is searching for a quoted message on the server.
    /// Drives the slow continuous scroll on the underlying UICollectionView.
    var isSearchingQuotedMessage: Bool = false
    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the user approaches the older-messages threshold. Wire to
    /// `ConversationViewModel.loadOlderMessages()` so pagination chains cache
    /// then network — bypassing this hook leaves the store stuck on whatever
    /// GRDB already holds.
    var onLoadOlder: (() async -> Void)?
    /// Invoked when the scroll position crosses the near-bottom threshold.
    /// Drives the floating "scroll to latest" button in the parent SwiftUI view.
    var onNearBottomChanged: ((Bool) -> Void)?
    /// Tap on a story reply preview inside a bubble. Argument is the story id
    /// (not the message id) — the parent resolves it to a story group + slide.
    var onStoryReplyTap: ((String) -> Void)?
    /// Tap on the sender avatar's story ring in a bubble footer. Argument is
    /// the sender's user id — the parent presents the story viewer.
    var onViewSenderStory: ((String) -> Void)?
    /// Swipe-to-reply on a bubble. Argument is the swiped message id.
    var onSwipeReply: ((String) -> Void)?
    /// Swipe-to-forward on a bubble. Argument is the swiped message id.
    var onSwipeForward: ((String) -> Void)?
    /// Long-press on a bubble — opens the contextual options menu for that
    /// message (reply, forward, react, copy, delete, …).
    var onLongPress: ((String) -> Void)?
    /// User-initiated reaction add. Carries the message id and the tapped
    /// bubble cell's on-screen frame (window coords, `nil` when the cell is
    /// not realized) so the quick-reaction bar can anchor to the bubble.
    var onAddReaction: ((String, CGRect?) -> Void)?
    /// Toggle a reaction emoji on a message (tap an existing reaction chip).
    var onToggleReaction: ((String, String) -> Void)?
    /// BUG2 A' — réaction par-image (attachmentId, messageId, emoji).
    var onReactToAttachment: ((String, String, String) -> Void)?
    /// Open the full reactions list / picker sheet for a message.
    var onOpenReactPicker: ((String) -> Void)?
    /// Open the message detail sheet on the "info / views" tab.
    var onShowMessageInfo: ((String) -> Void)?
    /// Tap on the delivery checkmarks (✓ / ✓✓ / ✓✓ bleu) of a sent message —
    /// opens the detail sheet directly on the "vues" tab so the author can
    /// inspect read receipts without going through the long-press menu.
    var onShowReadStatus: ((String) -> Void)?
    /// Manual resend of a FAILED outgoing message (id) → `retryMessage`.
    var onRetry: ((String) -> Void)?
    /// Open the message detail sheet on the "reactions" tab.
    var onShowReactions: ((String) -> Void)?
    /// Open the message detail sheet on the "language / translation" tab.
    var onShowTranslationDetail: ((String) -> Void)?
    /// Tap on a media attachment — typically pushes a fullscreen viewer.
    var onMediaTap: ((MessageAttachment) -> Void)?
    /// Consume a view-once message; the bubble flips to the consumed state.
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    /// Request an on-demand translation of a specific message into a target
    /// language (issues a socket `translation:request`).
    var onRequestTranslation: ((String, String) -> Void)?
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @Environment(\.colorScheme) private var colorScheme

    class Coordinator {
        var lastScrollToBottomTrigger: Int = 0
        var lastScrollToMessageTrigger: Int = 0
        var wasSearchingQuotedMessage: Bool = false
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIViewController(context: Context) -> MessageListViewController {
        let vc = MessageListViewController(
            store: store,
            currentUserId: currentUserId,
            accentColor: accentColor,
            isDirect: isDirect,
            isDark: colorScheme == .dark,
            router: router,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationListViewModel: conversationListViewModel
        )
        vc.onNewMessagesBadge = onNewMessagesBadge
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.onNearBottomChanged = onNearBottomChanged
        vc.onStoryReplyTap = onStoryReplyTap
        vc.onViewSenderStory = onViewSenderStory
        vc.onSwipeReply = onSwipeReply
        vc.onSwipeForward = onSwipeForward
        vc.onLongPress = onLongPress
        vc.onAddReaction = onAddReaction
        vc.onToggleReaction = onToggleReaction
        vc.onReactToAttachment = onReactToAttachment
        vc.onOpenReactPicker = onOpenReactPicker
        vc.onShowMessageInfo = onShowMessageInfo
        vc.onShowReadStatus = onShowReadStatus
        vc.onRetry = onRetry
        vc.onShowReactions = onShowReactions
        vc.onShowTranslationDetail = onShowTranslationDetail
        vc.onMediaTap = onMediaTap
        vc.onConsumeViewOnce = onConsumeViewOnce
        vc.onRequestTranslation = onRequestTranslation
        vc.onCallBack = { [weak conversationViewModel] summary in
            conversationViewModel?.callBack(for: summary)
        }
        vc.conversationViewModel = conversationViewModel
        vc.applyBottomInset(bottomInset)
        return vc
    }

    func updateUIViewController(_ vc: MessageListViewController, context: Context) {
        vc.update(isDark: colorScheme == .dark, accentColor: accentColor)
        // If the trigger changed since last update, scroll to latest.
        if scrollToBottomTrigger != context.coordinator.lastScrollToBottomTrigger {
            context.coordinator.lastScrollToBottomTrigger = scrollToBottomTrigger
            vc.scrollToBottom(animated: true)
        }
        // If the trigger changed, FAST scroll to the requested message
        // (this fires after jumpToQuotedMessage loaded the target from server).
        if scrollToMessageTrigger != context.coordinator.lastScrollToMessageTrigger {
            context.coordinator.lastScrollToMessageTrigger = scrollToMessageTrigger
            if let targetId = scrollToMessageId {
                vc.scrollToMessageFast(localId: targetId)
            }
        }
        // Start/stop slow scroll based on search state.
        if isSearchingQuotedMessage != context.coordinator.wasSearchingQuotedMessage {
            context.coordinator.wasSearchingQuotedMessage = isSearchingQuotedMessage
            if isSearchingQuotedMessage {
                vc.startSlowScrollUp()
            } else {
                vc.stopSlowScroll()
            }
        }
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.onNearBottomChanged = onNearBottomChanged
        vc.onStoryReplyTap = onStoryReplyTap
        vc.onViewSenderStory = onViewSenderStory
        vc.onSwipeReply = onSwipeReply
        vc.onSwipeForward = onSwipeForward
        vc.onLongPress = onLongPress
        vc.onAddReaction = onAddReaction
        vc.onToggleReaction = onToggleReaction
        vc.onReactToAttachment = onReactToAttachment
        vc.onOpenReactPicker = onOpenReactPicker
        vc.onShowMessageInfo = onShowMessageInfo
        vc.onShowReadStatus = onShowReadStatus
        vc.onRetry = onRetry
        vc.onShowReactions = onShowReactions
        vc.onShowTranslationDetail = onShowTranslationDetail
        vc.onMediaTap = onMediaTap
        vc.onConsumeViewOnce = onConsumeViewOnce
        vc.onRequestTranslation = onRequestTranslation
        vc.onCallBack = { [weak conversationViewModel] summary in
            conversationViewModel?.callBack(for: summary)
        }
        vc.conversationViewModel = conversationViewModel
        vc.applyBottomInset(bottomInset)
    }

    // Filet de sécurité au démontage SwiftUI : coupe le CADisplayLink du
    // slow-scroll (qui retient le VC) même si `viewDidDisappear` n'a pas
    // été déclenché par le chemin de dismiss emprunté.
    static func dismantleUIViewController(_ vc: MessageListViewController, coordinator: Coordinator) {
        vc.stopSlowScroll()
    }
}
