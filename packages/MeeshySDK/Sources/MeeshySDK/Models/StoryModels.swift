import CoreGraphics
import Foundation

// MARK: - Request Models
public struct ReactionRequest: Encodable {
    public let emoji: String
    public init(emoji: String) { self.emoji = emoji }
}

/// Corps de `POST /posts/from-attachment` — publier une pièce jointe DÉJÀ
/// reçue en conversation, sans la retélécharger.
///
/// Miroir de `PublishAttachmentSchema` (services/gateway/src/routes/posts/types.ts).
/// Les trois champs optionnels sont OMIS quand ils sont nils : le serveur
/// applique les mêmes défauts, et une clé absente vaut mieux qu'une
/// affirmation sans contenu.
public struct PublishAttachmentRequest: Encodable {
    /// La pièce jointe à publier. L'appartenance à sa conversation est vérifiée
    /// serveur : un identifiant seul n'autorise rien.
    public let attachmentId: String
    /// `nil` ⇒ la règle partagée choisit d'après le type MIME. Une STORY ne
    /// sort jamais de cette déduction — elle expire, donc elle se demande.
    public let target: String?
    /// Le mot que l'utilisateur ajoute à la publication.
    public let content: String?
    /// Le média sort de la caméra ou du micro de l'app. Le serveur ne s'en sert
    /// pas pour décider — il le journalise.
    public let capturedInApp: Bool?

    public init(attachmentId: String, target: String? = nil, content: String? = nil, capturedInApp: Bool? = nil) {
        self.attachmentId = attachmentId
        self.target = target
        self.content = content
        self.capturedInApp = capturedInApp
    }
}

public struct RepostRequest: Encodable {
    public let content: String?
    public let isQuote: Bool
    public let targetType: String?
    /// Audience choisie par le REPOSTEUR. `nil` ⇒ la gateway hérite de la
    /// visibilité de l'original. Sans ce champ, le sélecteur d'audience du
    /// composer de repost n'atteignait aucune couche : tout repost sortait avec
    /// la visibilité de l'original.
    ///
    /// La phrase « PUBLIC, seule visibilité qu'un original repostable puisse
    /// avoir » qui closait ce commentaire n'est plus vraie depuis le
    /// 2026-08-19 : la republication est ouverte aux originaux non publics. La
    /// valeur envoyée ici est VÉRIFIÉE par le serveur contre la loi d'audience
    /// — même audience ou plus restreinte, jamais plus large (403
    /// `REPOST_AUDIENCE_WIDENING`). Le miroir client de cette loi est
    /// `StoryRepostAudience` (MeeshyUI).
    public let visibility: String?

    public init(content: String? = nil, isQuote: Bool = false,
                targetType: String? = nil, visibility: String? = nil) {
        self.content = content
        self.isQuote = isQuote
        self.targetType = targetType
        self.visibility = visibility
    }
}

public struct StatusCreateRequest: Encodable {
    public let type = "STATUS"
    public let moodEmoji: String
    public let content: String?
    public let visibility: String
    public let visibilityUserIds: [String]?

    public init(moodEmoji: String, content: String?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil) {
        self.moodEmoji = moodEmoji; self.content = content; self.visibility = visibility; self.visibilityUserIds = visibilityUserIds
    }
}

public struct StoryViewRequest: Encodable {
    public let viewed = true
    public init() {}
}
