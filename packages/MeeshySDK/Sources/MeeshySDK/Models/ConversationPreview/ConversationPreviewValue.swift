import Foundation

// La VALEUR que rend le composeur de la ligne d'aperçu (#7546, #7548) — miroir
// Swift de `ConversationPreview` (`packages/shared/utils/conversation-preview.ts`).
//
// Une valeur STRUCTURÉE, jamais une chaîne : la ligne dessine l'icône, la
// couleur et l'italique avec son propre système. La mise à plat
// (`ConversationPreviewComposer.render`) ne sert qu'à VoiceOver et au fichier de
// cas commun que ce SDK rejoue.

public enum ConversationPreviewKind: String, Sendable, Hashable {
    case activeCall = "active-call"
    case typing
    case draft
    case reaction
    case message
    case call
    case system
    case empty
}

public enum ConversationPreviewTone: String, Sendable, Hashable {
    case `default`
    case accent
    case success
    case danger
    case system
}

public enum ConversationPreviewIcon: String, Sendable, Hashable, CaseIterable {
    case callAudio = "call-audio"
    case callVideo = "call-video"
    case voice
    case audio
    case video
    case photo
    case file
    case location
    case sticker
    case attachments
    case effect
    case forward
    case viewOnce = "view-once"
    case ephemeral
    case expired
    case hidden
    case encrypted

    /// Le glyphe de la MISE À PLAT — jamais l'icône dessinée, que chaque ligne
    /// tire de sa propre iconographie.
    public var glyph: String {
        switch self {
        case .callAudio: return "📞"
        case .callVideo: return "📹"
        case .voice: return "🎤"
        case .audio: return "🎵"
        case .video: return "🎬"
        case .photo: return "📷"
        case .file: return "📄"
        case .location: return "📍"
        case .sticker: return "🏷"
        case .attachments: return "📎"
        case .effect: return "✨"
        case .forward: return "↪"
        case .viewOnce: return "👁"
        case .ephemeral: return "🔥"
        case .expired: return "⏱"
        case .hidden: return "🙈"
        case .encrypted: return "🔒"
        }
    }
}

/// L'auteur préfixé à la ligne (`Alice : …`) — ou le brouillon, qui prend la
/// même place.
public enum ConversationPreviewAuthor: Sendable, Hashable {
    case reader(label: String)
    case member(id: String, label: String)
    case draft(label: String)

    public var label: String {
        switch self {
        case .reader(let label), .member(_, let label), .draft(let label): return label
        }
    }
}

/// `text` est un contenu d'utilisateur servi par le Prisme (`language` = langue
/// de la traduction servie, `nil` = l'original) ; `label` un libellé du
/// catalogue ; `countdown` le temps restant d'un éphémère, composé à `now`.
public enum ConversationPreviewSegment: Sendable, Hashable {
    case text(String, language: String?)
    case label(String)
    case countdown(String, expiresAt: Date)

    public var text: String {
        switch self {
        case .text(let text, _), .label(let text), .countdown(let text, _): return text
        }
    }
}

public struct ConversationPreview: Sendable, Hashable {
    public enum Direction: String, Sendable, Hashable { case incoming, outgoing }

    public let kind: ConversationPreviewKind
    public let tone: ConversationPreviewTone
    public let icon: ConversationPreviewIcon?
    public let author: ConversationPreviewAuthor?
    public let segments: [ConversationPreviewSegment]
    /// Présent ⇒ la ligne change d'elle-même à cet instant (un éphémère qui
    /// expire) : la ligne recompose alors, sans attendre un événement.
    public let liveUntil: Date?
    /// `true` ⇒ la ligne porte le bouton Rejoindre (appel en cours).
    public let offersJoin: Bool
    public let direction: Direction?

    public init(
        kind: ConversationPreviewKind,
        tone: ConversationPreviewTone = .default,
        icon: ConversationPreviewIcon? = nil,
        author: ConversationPreviewAuthor? = nil,
        segments: [ConversationPreviewSegment],
        liveUntil: Date? = nil,
        offersJoin: Bool = false,
        direction: Direction? = nil
    ) {
        self.kind = kind
        self.tone = tone
        self.icon = icon
        self.author = author
        self.segments = segments
        self.liveUntil = liveUntil
        self.offersJoin = offersJoin
        self.direction = direction
    }
}
