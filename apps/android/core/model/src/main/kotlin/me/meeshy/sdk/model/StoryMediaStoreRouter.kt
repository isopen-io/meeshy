package me.meeshy.sdk.model

import me.meeshy.sdk.model.mediacache.MediaCacheCategory

/**
 * Type EFFECTIF d'un média de story pour le routage vers les magasins disque (images / vidéo / audio), miroir de
 * `StoryMediaStoreRouter` (iOS). L'extension d'URL, quand elle est reconnue, est la vérité du CONTENU et corrige un
 * type déclaré absent ou contradictoire (un mp4 déclaré image rangé dans le magasin d'images ne se rejoue pas). Une URL
 * sans extension exploitable (CDN signé) retombe sur le type déclaré, sinon sur l'image historique.
 */
object StoryMediaStoreRouter {
    private val videoExtensions = setOf("mp4", "mov", "m4v", "webm", "avi")
    private val audioExtensions = setOf("m4a", "mp3", "aac", "wav", "ogg", "opus", "caf")
    private val imageExtensions = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif")

    fun effectiveKind(declaredType: FeedMediaType?, url: String): FeedMediaType {
        val extension = extensionOf(url)
        return when {
            extension in videoExtensions -> FeedMediaType.VIDEO
            extension in audioExtensions -> FeedMediaType.AUDIO
            extension in imageExtensions -> FeedMediaType.IMAGE
            else -> declaredType ?: FeedMediaType.IMAGE
        }
    }

    /** Le magasin disque d'un type effectif : vidéo et audio ont le leur, tout le reste passe par les images. */
    fun category(kind: FeedMediaType): MediaCacheCategory = when (kind) {
        FeedMediaType.VIDEO -> MediaCacheCategory.VIDEO
        FeedMediaType.AUDIO -> MediaCacheCategory.AUDIO
        else -> MediaCacheCategory.IMAGES
    }

    private fun extensionOf(url: String): String {
        val path = url.substringBefore('#').substringBefore('?')
        val name = path.substringAfterLast('/')
        if (!name.contains('.')) return ""
        return name.substringAfterLast('.').lowercase()
    }
}
