import Foundation

public extension PostRecord {
    /// stores-05 (option A — lecteur GRDB activé) : projection du cache
    /// `feed_posts` vers le modèle de rendu, pour le fallback offline de
    /// pagination. Réutilise la MÊME résolution Prisme
    /// (`APIPost.resolveTranslation`) et les MÊMES conversions
    /// (`toFeedMedia`, `toRepostContent`) que `APIPost.toFeedPost` — aucune
    /// logique de langue ni de média dupliquée. Les blobs JSON indécodables
    /// dégradent en champ vide, jamais en échec du mapping.
    func toFeedPost(preferredLanguages: [String] = []) -> FeedPost {
        let decoder = JSONDecoder()
        let apiTranslations = translationsJson.flatMap {
            try? decoder.decode([String: APIPostTranslationEntry].self, from: $0)
        }
        let apiMedia = mediaJson.flatMap { try? decoder.decode([APIPostMedia].self, from: $0) }
        let apiRepost = repostOfJson.flatMap { try? decoder.decode(APIRepostOf.self, from: $0) }

        let displayName = authorDisplayName ?? authorUsername ?? ""
        var feedPost = FeedPost(
            id: id, author: displayName, authorId: authorId,
            authorUsername: authorUsername,
            authorAvatarURL: authorAvatarURL,
            type: type, content: content ?? "",
            timestamp: createdAt, likes: likeCount,
            comments: [], commentCount: commentCount,
            repost: apiRepost?.toRepostContent(),
            repostAuthor: apiRepost != nil ? displayName : nil,
            isQuote: isQuote,
            media: (apiMedia ?? []).map { $0.toFeedMedia() },
            originalLanguage: originalLanguage,
            translations: apiTranslations?.mapValues {
                PostTranslation(text: $0.text, translationModel: $0.translationModel,
                                confidenceScore: $0.confidenceScore)
            },
            translatedContent: APIPost.resolveTranslation(
                translations: apiTranslations,
                originalLanguage: originalLanguage,
                preferredLanguages: preferredLanguages
            )
        )
        feedPost.isLiked = isLikedByMe
        feedPost.repostCount = repostCount
        feedPost.bookmarkCount = bookmarkCount
        feedPost.shareCount = shareCount
        feedPost.viewCount = viewCount
        feedPost.audioUrl = audioUrl
        feedPost.location = location
        feedPost.visibility = visibility
        feedPost.visibilityUserIds = visibilityUserIds
        return feedPost
    }
}
