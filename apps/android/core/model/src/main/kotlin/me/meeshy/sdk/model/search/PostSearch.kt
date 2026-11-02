package me.meeshy.sdk.model.search

import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.postType

/** Où un toucher sur un résultat de l'onglet Posts conduit. */
public sealed interface PostSearchDestination {
    public data class Post(val postId: String) : PostSearchDestination
    public data class Reel(val postId: String) : PostSearchDestination
    public data class Story(val authorId: String, val storyId: String) : PostSearchDestination
}

/** Une publication trouvée, telle que l'onglet Posts de la recherche générale la montre (#14620). */
public data class PostSearchHit(
    val postId: String,
    val kind: PostType,
    val authorId: String,
    val authorName: String,
    val authorAvatar: String?,
    /** Le texte SERVI au lecteur (famille posts du Prisme), jamais une traduction étrangère. */
    val text: String,
    val thumbnailUrl: String?,
    val createdAtMillis: Long,
) {
    val destination: PostSearchDestination
        get() = when (kind) {
            PostType.REEL -> PostSearchDestination.Reel(postId)
            PostType.STORY -> PostSearchDestination.Story(authorId, postId)
            else -> PostSearchDestination.Post(postId)
        }
}

/**
 * La loi de l'onglet Posts de la recherche générale (#14620), qui remplace l'onglet
 * Conversations. La visibilité est tranchée par le serveur (loi du fil) ; le client reste
 * fail-closed sur ce qu'il sait lire lui-même : seul un post, un réel ou une story s'affiche
 * (un statut n'est pas un post), une publication EXPIRÉE ne s'affiche jamais, et une
 * publication sans auteur ne peut pas s'ouvrir.
 */
public object PostSearch {

    public const val LIMIT: Int = 20

    private val searchable = setOf(PostType.POST, PostType.REEL, PostType.STORY)

    public fun hitOf(post: ApiPost, readerPrism: List<String>, nowMillis: Long): PostSearchHit? {
        val kind = post.postType?.takeIf { it in searchable } ?: return null
        val author = post.author ?: return null
        val expiresAt = isoToEpochMillisOrNull(post.expiresAt)
        if (expiresAt != null && expiresAt <= nowMillis) return null
        return PostSearchHit(
            postId = post.id,
            kind = kind,
            authorId = author.id,
            authorName = author.displayName?.takeIf { it.isNotBlank() } ?: author.username.orEmpty(),
            authorAvatar = author.avatar,
            text = servedText(post, readerPrism),
            thumbnailUrl = post.media.orEmpty().firstNotNullOfOrNull(::thumbnailOf),
            createdAtMillis = isoToEpochMillisOrNull(post.createdAt) ?: 0L,
        )
    }

    public fun hitsOf(posts: List<ApiPost>, readerPrism: List<String>, nowMillis: Long): List<PostSearchHit> =
        posts.mapNotNull { hitOf(it, readerPrism, nowMillis) }.distinctBy { it.postId }

    private fun thumbnailOf(media: ApiPostMedia): String? =
        media.thumbnailUrl?.takeIf { it.isNotBlank() }
            ?: media.fileUrl?.takeIf { media.mimeType.orEmpty().startsWith("image/") }

    private fun servedText(post: ApiPost, readerPrism: List<String>): String =
        PrismTranslationResolver.resolve(
            originalLanguage = post.originalLanguage,
            candidates = post.translations.orEmpty().map { (language, entry) -> PrismCandidate(language, entry.text) },
            preferredLanguages = readerPrism,
        )?.text ?: post.content.orEmpty()
}
