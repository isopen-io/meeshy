import CoreGraphics
import Foundation

// MARK: - Reply Context
public enum ReplyContext {
    case story(storyId: String, authorId: String, authorName: String, preview: String,
               publishedAt: Date? = nil, reactionCount: Int? = nil, commentCount: Int? = nil, thumbnailUrl: String? = nil)
    case status(statusId: String, authorId: String, authorName: String, emoji: String, content: String?, publishedAt: Date? = nil)

    /// Identifiant de l'auteur cité — utilisé pour résoudre/ouvrir la DM
    /// correspondante avant d'amorcer la réponse.
    public var authorId: String {
        switch self {
        case .story(_, let authorId, _, _, _, _, _, _): return authorId
        case .status(_, let authorId, _, _, _, _): return authorId
        }
    }

    /// `authorAvatarUrl` reste nil aux DEUX branches, et ce n'est pas un oubli :
    /// `ReplyContext` porte bien un `authorId`, mais aucune URL d'avatar — son
    /// producteur unique tient l'avatar (`StoryGroup.avatarURL`) sans le lui
    /// passer. Consequence produit ASSUMEE : une citation de story ou d'humeur
    /// n'expose PAS de porte vers le profil de l'auteur ; elle saute au post.
    /// Le jour ou le produit voudra cette porte, la donnee est atteignable —
    /// il faudra elargir `ReplyContext`, pas ce fichier seul.
    public var toReplyReference: ReplyReference {
        switch self {
        case .story(let storyId, let authorId, let authorName, let preview, let publishedAt, let reactionCount, let commentCount, let thumbnailUrl):
            return ReplyReference(messageId: storyId, authorName: authorName, previewText: preview, isStoryReply: true,
                                  storyPublishedAt: publishedAt, storyReactionCount: reactionCount, storyCommentCount: commentCount, storyThumbnailUrl: thumbnailUrl, storyAuthorId: authorId)
        case .status(let statusId, let authorId, let authorName, let emoji, let content, let publishedAt):
            // Réponse à un mood : le contenu entier va dans previewText, l'emoji
            // et la date sont portés séparément pour un rendu dédié (emoji +
            // contenu + date). `isStoryReply` reste vrai pour router l'envoi via
            // `storyReplyToId` (le mood est un post côté backend).
            return ReplyReference(messageId: statusId, authorName: authorName,
                                  previewText: content ?? "", isStoryReply: true,
                                  storyPublishedAt: publishedAt, moodEmoji: emoji, storyAuthorId: authorId)
        }
    }
}
