import Foundation
import MeeshySDK

/// Décrit ce que CE message doit rendre. Construit une fois par cellule,
/// puis lu par les sous-vues. Aucune sous-vue ne lit `MeeshyMessage` directement —
/// elles lisent `BubbleContent`. Cela garantit qu'un message simple ne paie
/// que pour ce qu'il affiche.
struct BubbleContent: Equatable {
    enum Kind: Equatable {
        case standard
        case deleted
        case burned
        case ephemeralExpired
    }

    enum Attachments: Equatable {
        case none
        case visualGrid([MeeshyMessageAttachment])    // images + videos
        case audio(MeeshyMessageAttachment)
        case nonMedia([MeeshyMessageAttachment])      // file + location
        case mixed(visual: [MeeshyMessageAttachment], nonMedia: [MeeshyMessageAttachment])

        static func == (lhs: Attachments, rhs: Attachments) -> Bool {
            switch (lhs, rhs) {
            case (.none, .none):
                return true
            case (.visualGrid(let a), .visualGrid(let b)):
                return a.map(\.id) == b.map(\.id)
            case (.audio(let a), .audio(let b)):
                return a.id == b.id
            case (.nonMedia(let a), .nonMedia(let b)):
                return a.map(\.id) == b.map(\.id)
            case (.mixed(let av, let an), .mixed(let bv, let bn)):
                return av.map(\.id) == bv.map(\.id) && an.map(\.id) == bn.map(\.id)
            default:
                return false
            }
        }
    }

    struct Text: Equatable {
        let raw: String
        let isEmojiOnly: Bool
        let emojiFontSize: CGFloat?
    }

    struct Translation: Equatable {
        let preferredContent: String?      // contenu affiché (peut == raw si pas traduit)
        let activeLangCode: String         // langue actuellement affichée
        let originalLangCode: String
        let availableFlags: [String]       // dédupliqué, ordonné
        let secondaryLangCode: String?     // panneau inline ouvert ?
        let secondaryContent: String?
    }

    struct Reply: Equatable {
        let reference: ReplyReference
        let isStory: Bool

        static func == (lhs: Reply, rhs: Reply) -> Bool {
            lhs.reference.messageId == rhs.reference.messageId
                && lhs.reference.previewText == rhs.reference.previewText
                && lhs.isStory == rhs.isStory
        }
    }

    struct Ephemeral: Equatable {
        let expiresAt: Date
    }

    struct Meta: Equatable {
        let timeString: String
        let deliveryStatus: MeeshyMessage.DeliveryStatus?  // nil si reçu
    }

    let messageId: String
    let kind: Kind
    let text: Text?
    let translation: Translation?
    let reply: Reply?
    let attachments: Attachments
    let ephemeral: Ephemeral?
    let isBlurred: Bool                    // gates le composant de blur reveal
    let isViewOnce: Bool
    let isPinned: Bool
    let isForwarded: Bool
    let editedAt: Date?
    let isEditSaving: Bool
    let hasEditHistory: Bool
    let reactions: [MeeshyReactionSummary]
    let meta: Meta
    let isMe: Bool
    let senderName: String?

    /// Convenience pour tests + branch logic du body.
    var isEmojiOnly: Bool { text?.isEmojiOnly ?? false }
    var hasTextOrNonMediaContent: Bool {
        guard let text else {
            if case .nonMedia = attachments { return true }
            if case .mixed = attachments { return true }
            return false
        }
        return !text.raw.isEmpty
    }

    static func == (lhs: BubbleContent, rhs: BubbleContent) -> Bool {
        lhs.messageId == rhs.messageId
            && lhs.kind == rhs.kind
            && lhs.text == rhs.text
            && lhs.translation == rhs.translation
            && lhs.reply == rhs.reply
            && lhs.attachments == rhs.attachments
            && lhs.ephemeral == rhs.ephemeral
            && lhs.isBlurred == rhs.isBlurred
            && lhs.isViewOnce == rhs.isViewOnce
            && lhs.isPinned == rhs.isPinned
            && lhs.isForwarded == rhs.isForwarded
            && lhs.editedAt == rhs.editedAt
            && lhs.isEditSaving == rhs.isEditSaving
            && lhs.hasEditHistory == rhs.hasEditHistory
            && lhs.reactions.map(\.emoji) == rhs.reactions.map(\.emoji)
            && lhs.reactions.map(\.count) == rhs.reactions.map(\.count)
            && lhs.reactions.map(\.includesMe) == rhs.reactions.map(\.includesMe)
            && lhs.meta == rhs.meta
            && lhs.isMe == rhs.isMe
            && lhs.senderName == rhs.senderName
    }
}
