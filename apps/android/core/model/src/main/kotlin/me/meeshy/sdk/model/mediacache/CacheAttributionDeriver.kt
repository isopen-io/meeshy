package me.meeshy.sdk.model.mediacache

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.StoryEffects

/**
 * Reconstruit, depuis les charges en cache, la carte « domaine -> URLs » (miroir de `CacheMediaAttribution`, iOS).
 *
 * Les fichiers disque sont indexés par URL et ne portent aucun domaine : l'attribution est DÉRIVÉE à la demande des
 * entités qui les citent. Sa limite est assumée : un fichier dont l'entité porteuse a disparu n'est plus attribuable ;
 * il est compté à part (médias orphelins) et purgeable en bloc, jamais oublié.
 */
public object CacheAttributionDeriver {

    /** Les pièces jointes des messages -> domaine Conversations. */
    public fun indexMessages(messages: List<ApiMessage>): CacheMediaIndex {
        val builder = CacheMediaIndex.Builder()
        messages.forEach { message ->
            message.attachments.forEach { attachment ->
                builder.add(attachment.fileUrl, MediaStoreRouter.declaredFromMime(attachment.mimeType))
                builder.addImage(attachment.thumbnailUrl)
                attachment.imageVariants.orEmpty().forEach { builder.addImage(it.url) }
                attachment.translations.orEmpty().values.forEach { builder.addAudio(it.url) }
            }
        }
        return builder.build()
    }

    /** Les médias des stories (post, canevas, son de fond, avatar de l'auteur) -> domaine Stories. */
    public fun indexStories(stories: List<ApiPost>): CacheMediaIndex {
        val builder = CacheMediaIndex.Builder()
        stories.forEach { story ->
            builder.addImage(story.author?.avatar)
            collect(story, builder)
        }
        return builder.build()
    }

    /** Ventile les publications du fil entre Publications et Réels (`type == "REEL"`, casse indifférente). */
    public fun indexFeed(posts: List<ApiPost>): Map<CacheDomain, CacheMediaIndex> {
        val (reels, others) = posts.partition { it.type.equals("REEL", ignoreCase = true) }
        return mapOf(
            CacheDomain.POSTS to indexPosts(others),
            CacheDomain.REELS to indexPosts(reels),
        )
    }

    private fun indexPosts(posts: List<ApiPost>): CacheMediaIndex {
        val builder = CacheMediaIndex.Builder()
        posts.forEach { post ->
            collect(post, builder)
            // Le repost embarque ses propres médias : sans eux, purger le domaine laisserait sur disque le contenu republié.
            post.repostOf?.let { repost ->
                collect(repost.media, builder)
                builder.addAudio(repost.audioUrl)
                repost.storyEffects?.let { collect(it, builder) }
            }
            post.comments.orEmpty().forEach { collect(it.media, builder) }
        }
        return builder.build()
    }

    private fun collect(post: ApiPost, builder: CacheMediaIndex.Builder) {
        collect(post.media, builder)
        builder.addAudio(post.audioUrl)
        post.storyEffects?.let { collect(it, builder) }
    }

    private fun collect(media: List<ApiPostMedia>?, builder: CacheMediaIndex.Builder) {
        media.orEmpty().forEach { item ->
            builder.add(item.fileUrl, MediaStoreRouter.declaredFromMime(item.mimeType))
            builder.addImage(item.thumbnailUrl)
            item.translations.orEmpty().values.forEach { builder.addAudio(it.url) }
        }
    }

    /**
     * Le canevas d'une story porte ses propres médias, indépendants de `media` : un fond vidéo ou une piste posée sur la
     * scène n'existe QUE là, et ce sont les fichiers les plus lourds d'une story.
     */
    private fun collect(effects: StoryEffects, builder: CacheMediaIndex.Builder) {
        effects.mediaObjects.orEmpty().forEach {
            val declared = if (it.mediaType.equals("video", ignoreCase = true)) DeclaredMediaType.VIDEO else DeclaredMediaType.IMAGE
            builder.add(it.mediaURL, declared)
        }
        effects.audioPlayerObjects.orEmpty().forEach { builder.addAudio(it.mediaURL) }
    }
}
