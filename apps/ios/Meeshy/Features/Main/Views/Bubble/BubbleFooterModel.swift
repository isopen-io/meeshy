import Foundation
import MeeshySDK

/// Where a footer is rendered.
enum BubbleFooterStyle: Equatable, Sendable {
    case row      // below text / emoji / audio content, inside the bubble
    case overlay  // dark capsule laid over image / video media
    case compact  // inline next to emoji-only messages — timestamp + delivery only
}

/// One language flag in the footer's language switcher.
struct FooterFlag: Equatable, Sendable {
    let code: String
    let isActive: Bool
}

/// Identity shown on the leading edge of a `.row` footer. Populated for a
/// received message that heads a group; nil for sent messages and for
/// intermediate received messages.
struct SenderIdentity: Equatable, Sendable {
    let name: String
    let username: String?
    let role: MemberRole?
    let avatarURL: String?
    let accentColor: String
    let moodEmoji: String?
    let presence: PresenceState
    let storyRing: StoryRingState
}

/// Pure, synchronously-built descriptor of a bubble footer. No I/O, no async.
/// `Equatable` so `BubbleFooter` can be `.equatable()` and skip re-render.
struct BubbleFooterModel: Equatable, Sendable {
    var sender: SenderIdentity?
    var flags: [FooterFlag]
    var showsTranslate: Bool
    var timestamp: String?
    var delivery: MeeshyMessage.DeliveryStatus?
    var isOffline: Bool
    var isMe: Bool
    /// The message's `createdAt`, carried through only while `delivery ==
    /// .sending` — drives `BubbleDeliveryCheck.SendingClockGlyph`'s reveal
    /// debounce (spec §6.2). `nil` for every other delivery state.
    var sendStartedAt: Date?

    /// A send still in flight — clock territory (excludes `.failed`).
    var isPending: Bool {
        switch delivery {
        case .sending, .clock, .slow, .invisible: return true
        default: return false
        }
    }

    /// A send the outbox gave up on.
    var isFailed: Bool { delivery == .failed }

    static let empty = BubbleFooterModel(
        sender: nil, flags: [], showsTranslate: false,
        timestamp: nil, delivery: nil, isOffline: false, isMe: false, sendStartedAt: nil
    )
}

/// Per-element callbacks. Kept out of `BubbleFooterModel` so the model stays
/// cleanly `Equatable`. Every callback is optional and independent — a
/// consumer wires only the elements it wants to be interactive.
struct BubbleFooterActions {
    var onFlagTap: ((String) -> Void)?
    var onTranslate: (() -> Void)?
    var onRetry: (() -> Void)?
    var onSenderTap: (() -> Void)?
    var onViewStory: (() -> Void)?
    /// Tap sur les coches de livraison (✓ / ✓✓ / ✓✓ bleu). Quand fourni, le
    /// `BubbleDeliveryCheck` devient un bouton qui ouvre le sheet detail sur
    /// l'onglet "Vues" pour consulter le statut de reception/lecture detail.
    /// Wirage UIKit-bridged : `MessageListViewController` -> `MessageListView`
    /// -> `ConversationView` (onShowReadStatus) -> `overlayState.detailSheetMessage`
    /// + `.moreSheetInitialItem = .views` (feuille native MessageMoreSheet).
    var onShowReadStatus: (() -> Void)?

    init(
        onFlagTap: ((String) -> Void)? = nil,
        onTranslate: (() -> Void)? = nil,
        onRetry: (() -> Void)? = nil,
        onSenderTap: (() -> Void)? = nil,
        onViewStory: (() -> Void)? = nil,
        onShowReadStatus: (() -> Void)? = nil
    ) {
        self.onFlagTap = onFlagTap
        self.onTranslate = onTranslate
        self.onRetry = onRetry
        self.onSenderTap = onSenderTap
        self.onViewStory = onViewStory
        self.onShowReadStatus = onShowReadStatus
    }

    static let none = BubbleFooterActions()
}

extension BubbleFooterModel {
    /// Builds a footer model.
    ///
    /// `timestamp` est toujours non-nil : l'heure s'affiche sur chaque bulle,
    /// alignée à droite avec la coche de livraison. C'est une information de
    /// premier rang, jamais un détail conditionnel.
    /// `delivery` reste non-nil uniquement pour les messages sortants (`isMe`).
    static func make(
        timeString: String,
        deliveryStatus: MeeshyMessage.DeliveryStatus,
        isMe: Bool,
        isOnline: Bool,
        sender: SenderIdentity?,
        flags: [FooterFlag],
        showsTranslate: Bool,
        sendStartedAt: Date? = nil
    ) -> BubbleFooterModel {
        BubbleFooterModel(
            sender: sender,
            flags: flags,
            showsTranslate: showsTranslate,
            timestamp: timeString,
            delivery: isMe ? deliveryStatus : nil,
            isOffline: !isOnline,
            isMe: isMe,
            sendStartedAt: (isMe && deliveryStatus == .sending) ? sendStartedAt : nil
        )
    }
}
