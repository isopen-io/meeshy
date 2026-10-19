import Foundation

// MARK: - Notification Context (where it happened)

public struct NotificationContext: Codable, Sendable, Equatable {
    public let conversationId: String?
    public let conversationTitle: String?
    public let conversationType: String?
    /// Avatar de la conversation/groupe — repli pour la toast quand l'expéditeur
    /// n'a pas d'avatar personnel (messages de groupe).
    public let conversationAvatar: String?
    public let messageId: String?
    public let originalMessageId: String?
    public let callSessionId: String?
    public let friendRequestId: String?
    public let reactionId: String?
    public let postId: String?
    public let commentId: String?
    /// Identifiant du commentaire parent quand `commentId` est une réponse.
    /// Permet de déplier le fil parent puis de défiler jusqu'à la réponse ciblée.
    public let parentCommentId: String?
    /// URL publique du 1er attachment du message (image/audio/vidéo).
    public let firstAttachmentUrl: String?
    /// MIME type du 1er attachment, ex. `audio/m4a`, `image/jpeg`.
    public let firstAttachmentMimeType: String?
    /// Durée en ms du 1er attachment audio/vidéo.
    public let firstAttachmentDurationMs: Int?
    /// Date ISO de publication de l'entité sociale liée (post/story/réel/mood).
    /// Permet d'afficher « publié il y a 2 j » même quand le contenu n'est plus
    /// accessible (story expirée).
    public let postCreatedAt: String?
    /// Date ISO d'expiration de l'entité sociale liée (story/status éphémère).
    /// Le client affiche « expirée » et explique la perte d'accès.
    public let postExpiresAt: String?

    public init(
        conversationId: String? = nil,
        conversationTitle: String? = nil,
        conversationType: String? = nil,
        conversationAvatar: String? = nil,
        messageId: String? = nil,
        originalMessageId: String? = nil,
        callSessionId: String? = nil,
        friendRequestId: String? = nil,
        reactionId: String? = nil,
        postId: String? = nil,
        commentId: String? = nil,
        parentCommentId: String? = nil,
        firstAttachmentUrl: String? = nil,
        firstAttachmentMimeType: String? = nil,
        firstAttachmentDurationMs: Int? = nil,
        postCreatedAt: String? = nil,
        postExpiresAt: String? = nil
    ) {
        self.conversationId = conversationId
        self.conversationTitle = conversationTitle
        self.conversationType = conversationType
        self.conversationAvatar = conversationAvatar
        self.messageId = messageId
        self.originalMessageId = originalMessageId
        self.callSessionId = callSessionId
        self.friendRequestId = friendRequestId
        self.reactionId = reactionId
        self.postId = postId
        self.commentId = commentId
        self.parentCommentId = parentCommentId
        self.firstAttachmentUrl = firstAttachmentUrl
        self.firstAttachmentMimeType = firstAttachmentMimeType
        self.firstAttachmentDurationMs = firstAttachmentDurationMs
        self.postCreatedAt = postCreatedAt
        self.postExpiresAt = postExpiresAt
    }
}
