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
        /// Mixed content: any combination of visual + non-media + audio
        /// when more than one category is present. Mirrors legacy bubble
        /// rendering which composed visualMediaGrid + audio standalone +
        /// non-media attachments inside a single bubble.
        case mixed(visual: [MeeshyMessageAttachment], audio: MeeshyMessageAttachment?, nonMedia: [MeeshyMessageAttachment])

        // TODO(Task14): expand equality to cover mutation-prone fields (thumbnailUrl,
        // isBlurred, viewOnceCount, width/height, duration, fileUrl) — id-only comparison
        // will miss server-side updates that should invalidate the bubble cache.
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
            case (.mixed(let av, let aa, let an), .mixed(let bv, let ba, let bn)):
                return av.map(\.id) == bv.map(\.id)
                    && aa?.id == ba?.id
                    && an.map(\.id) == bn.map(\.id)
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

        // TODO(Task14): expand equality to cover story-side mutations (attachmentThumbnailUrl,
        // storyThumbnailUrl, storyReactionCount, storyCommentCount, storyPublishedAt) — current
        // (messageId + previewText + isStory) misses late thumbnail/counter updates.
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
    /// Mirrors legacy `ThemedMessageBubble.hasTextOrNonMediaContent`:
    /// "audio-only with transcription text" returns false (audio bubble
    /// renders the transcription itself; no separate text bubble).
    /// Otherwise: true if text is non-empty OR non-media is present.
    var hasTextOrNonMediaContent: Bool {
        let hasText = !(text?.raw.isEmpty ?? true)
        let hasNonMedia: Bool = {
            switch attachments {
            case .nonMedia: return true
            case .mixed(_, _, let nm): return !nm.isEmpty
            case .none, .visualGrid, .audio: return false
            }
        }()
        // Audio-only with transcription text: legacy renders the transcription
        // inside the audio bubble, so the text bubble must be suppressed.
        let isAudioOnlyWithText: Bool = {
            guard hasText else { return false }
            switch attachments {
            case .audio: return true
            default: return false
            }
        }()
        if isAudioOnlyWithText { return false }
        return hasText || hasNonMedia
    }

    /// Routing pur : un audio seul en reply héberge sa citation dans le widget
    /// audio (topSlot), pas de chat bubble parasite. True iff `reply != nil`,
    /// not emoji-only, no text/non-media content, et `.audio` attachments.
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.4
    var audioHostsReply: Bool {
        guard reply != nil, !isEmojiOnly else { return false }
        guard !hasTextOrNonMediaContent else { return false }
        if case .audio = attachments { return true }
        return false
    }

    /// Routing pur : un visual-grid seul en reply rend la citation et la grille
    /// dans un conteneur unifié bordé, pas de chat bubble séparée. True iff
    /// `reply != nil`, not emoji-only, no text/non-media content, et
    /// `.visualGrid` attachments.
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.4
    var visualHostsReply: Bool {
        guard reply != nil, !isEmojiOnly else { return false }
        guard !hasTextOrNonMediaContent else { return false }
        if case .visualGrid = attachments { return true }
        return false
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
