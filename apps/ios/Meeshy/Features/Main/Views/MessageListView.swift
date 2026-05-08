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
    /// Used by the swipe indicator to display a "day month / hh:mm" stamp
    /// before the user has dragged past the reply threshold.
    let messageCreatedAt: Date
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
                .simultaneousGesture(dragGesture)
                // `.onLongPressGesture` consumes downstream taps — including
                // the smiley "+" add-reaction button rendered in the bubble's
                // overlay. Wrapping the LongPressGesture in
                // `.simultaneousGesture` lets SwiftUI deliver the tap to the
                // child view first, only firing the long press when no inner
                // tappable element handles the touch.
                .simultaneousGesture(
                    LongPressGesture(minimumDuration: 0.5)
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
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(MeeshyColors.brandPrimary)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    // Under the threshold — day + hour stamp gives the user
                    // context (when the message was sent) while they decide
                    // whether to commit the gesture.
                    VStack(spacing: 2) {
                        Text(swipeStampDay)
                            .font(.system(size: 11, weight: .medium))
                        Text(swipeStampTime)
                            .font(.system(size: 12, weight: .semibold))
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
        DragGesture(minimumDistance: 15)
            .onChanged { value in
                let h = value.translation.width
                let v = abs(value.translation.height)
                // Horizontal-dominant only (2:1 ratio) so vertical scroll
                // wins ties — keeps the parent UICollectionView scrolling
                // smooth when the user drags diagonally.
                guard abs(h) > v * 2 else { return }
                guard abs(h) > 12 else { return }
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
    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the user approaches the older-messages threshold. Wire to
    /// `ConversationViewModel.loadOlderMessages()` so pagination chains cache
    /// then network — bypassing this hook leaves the store stuck on whatever
    /// GRDB already holds.
    var onLoadOlder: (() async -> Void)?
    /// Tap on a story reply preview inside a bubble. Argument is the story id
    /// (not the message id) — the parent resolves it to a story group + slide.
    var onStoryReplyTap: ((String) -> Void)?
    /// Swipe-to-reply on a bubble. Argument is the swiped message id.
    var onSwipeReply: ((String) -> Void)?
    /// Swipe-to-forward on a bubble. Argument is the swiped message id.
    var onSwipeForward: ((String) -> Void)?
    /// Long-press on a bubble — opens the contextual options menu for that
    /// message (reply, forward, react, copy, delete, …).
    var onLongPress: ((String) -> Void)?
    /// User-initiated reaction add — typically opens the emoji picker bar
    /// inline near the message.
    var onAddReaction: ((String) -> Void)?
    /// Toggle a reaction emoji on a message (tap an existing reaction chip).
    var onToggleReaction: ((String, String) -> Void)?
    /// Open the full reactions list / picker sheet for a message.
    var onOpenReactPicker: ((String) -> Void)?
    /// Open the message detail sheet on the "info / views" tab.
    var onShowMessageInfo: ((String) -> Void)?
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
        vc.onStoryReplyTap = onStoryReplyTap
        vc.onSwipeReply = onSwipeReply
        vc.onSwipeForward = onSwipeForward
        vc.onLongPress = onLongPress
        vc.onAddReaction = onAddReaction
        vc.onToggleReaction = onToggleReaction
        vc.onOpenReactPicker = onOpenReactPicker
        vc.onShowMessageInfo = onShowMessageInfo
        vc.onShowReactions = onShowReactions
        vc.onShowTranslationDetail = onShowTranslationDetail
        vc.onMediaTap = onMediaTap
        vc.onConsumeViewOnce = onConsumeViewOnce
        vc.onRequestTranslation = onRequestTranslation
        vc.conversationViewModel = conversationViewModel
        vc.applyBottomInset(bottomInset)
        return vc
    }

    func updateUIViewController(_ vc: MessageListViewController, context: Context) {
        vc.update(isDark: colorScheme == .dark, accentColor: accentColor)
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.onStoryReplyTap = onStoryReplyTap
        vc.onSwipeReply = onSwipeReply
        vc.onSwipeForward = onSwipeForward
        vc.onLongPress = onLongPress
        vc.onAddReaction = onAddReaction
        vc.onToggleReaction = onToggleReaction
        vc.onOpenReactPicker = onOpenReactPicker
        vc.onShowMessageInfo = onShowMessageInfo
        vc.onShowReactions = onShowReactions
        vc.onShowTranslationDetail = onShowTranslationDetail
        vc.onMediaTap = onMediaTap
        vc.onConsumeViewOnce = onConsumeViewOnce
        vc.onRequestTranslation = onRequestTranslation
        vc.conversationViewModel = conversationViewModel
        vc.applyBottomInset(bottomInset)
    }
}
