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
        /// System notice rendered as a centered capsule (no avatar, no L/R
        /// alignment) — e.g. the call-summary messages "Appel vidéo · 04:32".
        /// Driven by `messageSource == .system`.
        case system
    }

    enum Attachments: Equatable {
        case none
        case visualGrid([MeeshyMessageAttachment])    // images + videos
        /// One OR MORE audio tracks of the SAME message. A single track renders
        /// as the existing audio widget; two or more render as a horizontal
        /// `AudioCarouselView` (multi-track carousel — spec lot A4).
        case audio([MeeshyMessageAttachment])
        case nonMedia([MeeshyMessageAttachment])      // file + location
        /// Mixed content: any combination of visual + non-media + audio
        /// when more than one category is present. Mirrors legacy bubble
        /// rendering which composed visualMediaGrid + audio standalone +
        /// non-media attachments inside a single bubble. `audio` carries all
        /// audio tracks of the message (empty when the mix has no audio).
        case mixed(visual: [MeeshyMessageAttachment], audio: [MeeshyMessageAttachment], nonMedia: [MeeshyMessageAttachment])

        static func == (lhs: Attachments, rhs: Attachments) -> Bool {
            switch (lhs, rhs) {
            case (.none, .none):
                return true
            case (.visualGrid(let a), .visualGrid(let b)):
                guard a.map(\.id) == b.map(\.id) else { return false }
                return zip(a, b).allSatisfy { Self.attachmentsHaveSameState($0.0, $0.1) }
            case (.audio(let a), .audio(let b)):
                guard a.map(\.id) == b.map(\.id) else { return false }
                return zip(a, b).allSatisfy { Self.attachmentsHaveSameState($0.0, $0.1) }
            case (.nonMedia(let a), .nonMedia(let b)):
                return a.map(\.id) == b.map(\.id)
            case (.mixed(let av, let aa, let an), .mixed(let bv, let ba, let bn)):
                guard av.map(\.id) == bv.map(\.id),
                      aa.map(\.id) == ba.map(\.id),
                      an.map(\.id) == bn.map(\.id) else { return false }
                return zip(av, bv).allSatisfy { Self.attachmentsHaveSameState($0.0, $0.1) }
                    && zip(aa, ba).allSatisfy { Self.attachmentsHaveSameState($0.0, $0.1) }
            default:
                return false
            }
        }

        /// Compares mutation-prone server-side fields that can change after initial delivery
        /// (thumbnail generation, blur reveal, view-once, per-image reactions, media metadata).
        /// Called only when IDs already match, so identity is not re-checked here.
        private static func attachmentsHaveSameState(
            _ a: MeeshyMessageAttachment,
            _ b: MeeshyMessageAttachment
        ) -> Bool {
            a.thumbnailUrl == b.thumbnailUrl
                && a.fileUrl == b.fileUrl
                && a.isBlurred == b.isBlurred
                && a.viewOnceCount == b.viewOnceCount
                && a.duration == b.duration
                && a.width == b.width
                && a.height == b.height
                && a.reactionSummary == b.reactionSummary
                && a.currentUserReactions == b.currentUserReactions
        }
    }

    struct Text: Equatable {
        let raw: String
        let isEmojiOnly: Bool
        let emojiFontSize: CGFloat?
        /// Première URL détectée dans `raw`, précalculée UNE fois par le builder
        /// (plutôt que jusqu'à 2× dans le body de chaque bulle texte). Le
        /// `NSDataDetector` sous-jacent est désormais partagé (static) côté
        /// `LinkPreviewFetcher`, donc plus d'instanciation par cellule au scroll.
        let firstLinkURL: String?
        /// Vidéo embeddable (YouTube) résolue depuis `firstLinkURL`, précalculée
        /// une fois par le builder. Non-nil → la bulle affiche un player façade
        /// (`VideoEmbedContainer`) au lieu de l'aperçu OpenGraph (`LinkPreviewCard`).
        let embeddedVideo: EmbeddedVideo?
        /// `[rawURL: token]` outbound-link tracking map for this message
        /// (`Message.trackedLinkMap`). Passed into every `MessageTextRenderer.render`
        /// call so raw URLs become tappable `/l/<token>` links. Empty → no rewrite.
        let trackedLinks: [String: String]
        /// Tracked destination for the embedded video façade, derived ONCE by the
        /// builder from `firstLinkURL` → `trackedLinks[firstLinkURL]` →
        /// `https://meeshy.me/l/<token>`. `nil` → façade opens the canonical watchURL.
        let embedTrackedURL: URL?
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
                && lhs.reference.moodEmoji == rhs.reference.moodEmoji
                && lhs.reference.storyPublishedAt == rhs.reference.storyPublishedAt
                && lhs.reference.attachmentThumbnailUrl == rhs.reference.attachmentThumbnailUrl
                && lhs.reference.storyThumbnailUrl == rhs.reference.storyThumbnailUrl
                && lhs.reference.storyReactionCount == rhs.reference.storyReactionCount
                && lhs.reference.storyCommentCount == rhs.reference.storyCommentCount
                && lhs.reference.storyShareCount == rhs.reference.storyShareCount
        }
    }

    struct Ephemeral: Equatable {
        let expiresAt: Date
    }

    struct Meta: Equatable {
        let timeString: String
        let deliveryStatus: MeeshyMessage.DeliveryStatus?  // nil si reçu
    }

    /// Resolved facts for a call-summary system message — everything the leaf
    /// `BubbleCallNoticeView` needs as primitives so it re-renders only when
    /// these change. `isOutgoing` is pre-resolved per viewer at build time
    /// (depends on the current user id) so the leaf view stays singleton-free.
    struct CallNotice: Equatable {
        let summary: CallSummaryMetadata
        /// Current user initiated this call (emitted) vs received it.
        let isOutgoing: Bool
        /// Gateway-localized label ("Appel vidéo · 04:32", "Appel audio manqué"),
        /// used as the human title base + VoiceOver fallback.
        let fallbackText: String
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
    /// Present for `.system` call-summary messages carrying structured metadata
    /// (`messageSource == .system` + `callSummary != nil`). When nil, a `.system`
    /// message falls back to the plain centered notice.
    let callNotice: CallNotice?

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
            && lhs.callNotice == rhs.callNotice
    }
}
