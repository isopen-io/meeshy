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
    let presence: PresenceState?
    let storyRing: StoryRingState

    /// « @pseudo » — ou rien. Le fil sert un pseudo VIDE pour un participant
    /// anonyme, et un « @ » nu sous le nom n'est pas une identité.
    static func handle(fromUsername username: String?) -> String? {
        guard let username, !username.isEmpty else { return nil }
        return "@\(username)"
    }
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
    /// #7620 — « modifié » se dit DANS le pied, à côté de l'heure. Posé en
    /// tête de bulle, le crayon tombait dans le coin arrondi et le
    /// `clipShape` le rognait.
    var edit: BubbleEditMark? = nil

    /// L'icône de traduction ne se montre que si AUCUN drapeau ne la dit déjà
    /// (#7599). Lue par la VUE : un site qui plie ses drapeaux après `make`
    /// (le widget audio) reste soumis à la même règle.
    var showsTranslateGlyph: Bool { showsTranslate && flags.isEmpty }

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
    ///
    /// #7599 — un état se dit UNE fois. Des drapeaux affichés disent déjà
    /// qu'une traduction existe : l'icône 🌐 ne reste que là où elle est la
    /// seule porte vers la demande. Et un échec d'envoi que la bande de renvoi
    /// porte ne se redit pas par la coche rouge.
    static func make(
        timeString: String,
        deliveryStatus: MeeshyMessage.DeliveryStatus,
        isMe: Bool,
        isOnline: Bool,
        sender: SenderIdentity?,
        flags: [FooterFlag],
        showsTranslate: Bool,
        sendStartedAt: Date? = nil,
        retryBandShown: Bool = false,
        edit: BubbleEditMark? = nil
    ) -> BubbleFooterModel {
        BubbleFooterModel(
            sender: sender,
            flags: flags,
            showsTranslate: showsTranslate && flags.isEmpty,
            timestamp: timeString,
            delivery: isMe ? glyphStatus(deliveryStatus, retryBandShown: retryBandShown) : nil,
            isOffline: !isOnline,
            isMe: isMe,
            sendStartedAt: (isMe && deliveryStatus == .sending) ? sendStartedAt : nil,
            edit: edit
        )
    }

    /// #7620 — une bulle n'offre la traduction que si elle porte un TEXTE à
    /// traduire (ou un audio, dont la transcription se traduit). Une position,
    /// un fichier, un média seul ou un émoji n'ont rien à traduire.
    static func offersTranslation(hasText: Bool, isEmojiOnly: Bool, hasAudio: Bool) -> Bool {
        !isEmojiOnly && (hasText || hasAudio)
    }
}

/// L'état « modifié » tel que le pied le dit : le crayon, ou la rotation
/// pendant que l'édition part au serveur.
enum BubbleEditMark: Equatable, Sendable {
    case edited
    case saving

    static func resolve(editedAt: Date?, isSaving: Bool) -> BubbleEditMark? {
        if isSaving { return .saving }
        return editedAt == nil ? nil : .edited
    }
}

extension BubbleFooterModel {
    /// L'état de livraison que la COCHE doit dire — la règle unique de la bulle
    /// et de la rangée plate (#7599). Un échec d'envoi est dit par la bande de
    /// renvoi quand elle est montée : la coche se tait alors, elle ne répète
    /// pas en rouge ce que la bande dit en rouge.
    static func glyphStatus(
        _ status: MeeshyMessage.DeliveryStatus?,
        retryBandShown: Bool
    ) -> MeeshyMessage.DeliveryStatus? {
        guard status == .failed, retryBandShown else { return status }
        return nil
    }
}
