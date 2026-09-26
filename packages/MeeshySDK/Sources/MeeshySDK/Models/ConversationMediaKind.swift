import Foundation

/// Les GENRES de l'index d'une conversation — `view=media&kinds=` (#8098, #8103).
///
/// Miroir de `GENRES_DE_MEDIA` (`services/gateway/src/routes/conversations/messages-media-kinds.ts`)
/// et de `MEDIA_HUB_KINDS` (web, `apps/web/src/lib/view/media-hub.ts`). La
/// passerelle sert des MESSAGES ; un message peut porter des pièces de genres
/// différents (une photo et un PDF dans le même envoi) : `owns(_:)` dit quelles
/// pièces appartiennent au genre, selon la MÊME partition que la clause serveur.
///
/// Le nom n'est pas `MediaKind` : ce symbole existe déjà (politique de
/// téléchargement, `MediaDownloadPreferences.swift`) et désigne autre chose.
public enum ConversationMediaKind: String, CaseIterable, Codable, Sendable, Hashable {
    case visual
    case audio
    case document
    case link
    case contact
    case conversation
    case location

    /// Le genre que la passerelle sert quand `kinds` est absent (#8095).
    public static let serverDefault: ConversationMediaKind = .visual

    /// Les genres portés par une PIÈCE JOINTE — les autres se lisent dans le
    /// contenu du message (lien, adresse de conversation) ou son type (lieu).
    public var isAttachmentKind: Bool {
        switch self {
        case .visual, .audio, .document, .contact: return true
        case .link, .conversation, .location: return false
        }
    }

    /// Le genre d'une pièce, d'après son type MIME — partition DISJOINTE,
    /// identique à la clause serveur : visuel = `image/*` · `video/*` ;
    /// audio = `audio/*` ; contact = `text/vcard` · `text/x-vcard` ;
    /// document = tout le reste.
    public static func ofAttachment(mimeType: String) -> ConversationMediaKind {
        let mime = mimeType.lowercased()
        if mime.hasPrefix("image/") || mime.hasPrefix("video/") { return .visual }
        if mime.hasPrefix("audio/") { return .audio }
        if mime.hasPrefix("text/vcard") || mime.hasPrefix("text/x-vcard") { return .contact }
        return .document
    }

    /// La clé de l'index persisté (`CacheCoordinator.conversationMedia`). Le
    /// visuel garde la clé NUE de #8100 — l'index déjà écrit sur les appareils
    /// reste lisible — les autres genres la suffixent.
    public func indexKey(conversationId: String) -> String {
        self == .visual ? conversationId : "\(conversationId)|\(rawValue)"
    }

    /// Toutes les clés d'index d'une conversation, pour purger ou retirer un
    /// message de CHAQUE genre à la fois.
    public static func allIndexKeys(conversationId: String) -> [String] {
        allCases.map { $0.indexKey(conversationId: conversationId) }
    }
}
