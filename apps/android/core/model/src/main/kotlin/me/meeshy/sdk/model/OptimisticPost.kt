package me.meeshy.sdk.model

import java.time.Instant

/** Un média local d'une publication en cours d'envoi : l'aperçu se lit depuis l'URI, jamais depuis le réseau. */
data class OptimisticMedia(
    val localUri: String,
    val mimeType: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val durationSeconds: Int? = null,
    val alt: String? = null,
    val caption: String? = null,
)

/**
 * La bulle optimiste d'une publication hors ligne : un [ApiPost] dont l'id est le `clientMutationId`, inséré en tête
 * du fil à l'instant du geste. `post:created` la remplace au même cmid, sans doublon ([reconcile]).
 */
object OptimisticPost {

    fun build(
        cmid: String,
        author: ApiAuthor?,
        content: String?,
        type: String = "POST",
        visibility: String = "PUBLIC",
        media: List<OptimisticMedia> = emptyList(),
        location: SharedPlace? = null,
        originalLanguage: String? = null,
        repostOfId: String? = null,
        createdAtMillis: Long,
    ): ApiPost = ApiPost(
        id = cmid,
        type = type,
        visibility = visibility,
        content = content?.takeIf { it.isNotBlank() },
        originalLanguage = originalLanguage,
        createdAt = Instant.ofEpochMilli(createdAtMillis).toString(),
        author = author,
        likeCount = 0,
        commentCount = 0,
        media = media.mapIndexed { index, item ->
            ApiPostMedia(
                id = "$cmid#$index",
                mimeType = item.mimeType,
                fileUrl = item.localUri,
                width = item.width,
                height = item.height,
                duration = item.durationSeconds,
                order = index,
                caption = item.caption,
                alt = item.alt,
            )
        }.takeIf { it.isNotEmpty() },
        originalRepostOfId = repostOfId,
        location = location,
    )

    /**
     * Range [published] à la place de la bulle [cmid] : la bulle est remplacée sur place, et si le serveur a déjà
     * livré le post (l'événement a devancé la réponse), la bulle disparaît sans que le post figure deux fois.
     */
    fun reconcile(feed: List<ApiPost>, cmid: String, published: ApiPost): List<ApiPost> {
        val alreadyThere = feed.any { it.id == published.id }
        val replaced = feed.mapNotNull { post ->
            when {
                post.id == cmid && alreadyThere -> null
                post.id == cmid -> published
                else -> post
            }
        }
        return replaced.distinctBy { it.id }
    }

    /** L'envoi a définitivement échoué : la bulle quitte le fil. */
    fun withdraw(feed: List<ApiPost>, cmid: String): List<ApiPost> = feed.filterNot { it.id == cmid }

    /** Insère la bulle en tête, une seule fois par cmid. */
    fun insertAtHead(feed: List<ApiPost>, optimistic: ApiPost): List<ApiPost> =
        if (feed.any { it.id == optimistic.id }) feed else listOf(optimistic) + feed
}
