package me.meeshy.sdk.model.mediacache

/** Nature d'un fichier, c'est-à-dire le stockage disque qui le détient (miroir de `CacheMediaKind`, iOS). */
public enum class CacheMediaKind { IMAGES, VIDEOS, AUDIO }

/** Type déclaré d'un média par l'entité qui le porte ; l'extension de l'URL a le dernier mot. */
public enum class DeclaredMediaType { IMAGE, VIDEO, AUDIO, DOCUMENT }

/**
 * Type effectif d'un média pour le routage vers les stockages disque (miroir de `StoryMediaStoreRouter`, iOS) :
 * l'EXTENSION de l'URL, quand elle est reconnue, est la vérité du contenu et corrige un type déclaré absent ou
 * contradictoire (un `.mp4` déclaré image se télécharge dans le stockage vidéo). Sans extension exploitable, le type
 * déclaré, sinon l'image historique.
 */
public object MediaStoreRouter {
    private val videoExtensions = setOf("mp4", "mov", "m4v", "webm", "avi")
    private val audioExtensions = setOf("m4a", "mp3", "aac", "wav", "ogg", "opus", "caf")
    private val imageExtensions = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif")

    public fun effectiveType(declared: DeclaredMediaType?, url: String): DeclaredMediaType {
        val extension = extensionOf(url)
        return when {
            extension in videoExtensions -> DeclaredMediaType.VIDEO
            extension in audioExtensions -> DeclaredMediaType.AUDIO
            extension in imageExtensions -> DeclaredMediaType.IMAGE
            else -> declared ?: DeclaredMediaType.IMAGE
        }
    }

    /** Type déclaré d'après un type MIME (`image/png`, `video/mp4`, `audio/mpeg`) ; autre = document. */
    public fun declaredFromMime(mimeType: String?): DeclaredMediaType? {
        val mime = mimeType?.lowercase()?.takeIf { it.isNotBlank() } ?: return null
        return when {
            mime.startsWith("image/") -> DeclaredMediaType.IMAGE
            mime.startsWith("video/") -> DeclaredMediaType.VIDEO
            mime.startsWith("audio/") -> DeclaredMediaType.AUDIO
            else -> DeclaredMediaType.DOCUMENT
        }
    }

    private fun extensionOf(url: String): String {
        val path = url.substringBefore('#').substringBefore('?')
        val segment = path.substringAfterLast('/')
        if (!segment.contains('.')) return ""
        return segment.substringAfterLast('.').lowercase()
    }
}

/**
 * Les URLs d'un domaine, ventilées par stockage. Des ensembles : la même URL peut apparaître plusieurs fois (un post
 * et son repost) et ne doit compter qu'une fois.
 */
public data class CacheMediaIndex(
    val images: Set<String> = emptySet(),
    val videos: Set<String> = emptySet(),
    val audio: Set<String> = emptySet(),
) {
    public val isEmpty: Boolean get() = images.isEmpty() && videos.isEmpty() && audio.isEmpty()

    public fun urls(kind: CacheMediaKind): Set<String> = when (kind) {
        CacheMediaKind.IMAGES -> images
        CacheMediaKind.VIDEOS -> videos
        CacheMediaKind.AUDIO -> audio
    }

    public operator fun plus(other: CacheMediaIndex): CacheMediaIndex =
        CacheMediaIndex(images + other.images, videos + other.videos, audio + other.audio)

    /** Builder mutable local à une dérivation ; l'index rendu est immuable. */
    public class Builder {
        private val images = linkedSetOf<String>()
        private val videos = linkedSetOf<String>()
        private val audio = linkedSetOf<String>()

        /** Route [url] vers son stockage par [MediaStoreRouter] ; un document n'a aucun stockage et est ignoré. */
        public fun add(url: String?, declared: DeclaredMediaType?) {
            if (url.isNullOrBlank()) return
            when (MediaStoreRouter.effectiveType(declared, url)) {
                DeclaredMediaType.VIDEO -> videos.add(url)
                DeclaredMediaType.AUDIO -> audio.add(url)
                DeclaredMediaType.IMAGE -> images.add(url)
                DeclaredMediaType.DOCUMENT -> Unit
            }
        }

        /** Image certaine (vignette, avatar servis par un CDN signé sans extension exploitable). */
        public fun addImage(url: String?) {
            if (!url.isNullOrBlank()) images.add(url)
        }

        public fun addAudio(url: String?) {
            if (!url.isNullOrBlank()) audio.add(url)
        }

        public fun build(): CacheMediaIndex = CacheMediaIndex(images.toSet(), videos.toSet(), audio.toSet())
    }
}
