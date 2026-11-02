package me.meeshy.sdk.media

import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import java.io.File

/** Sonde des médias stockés par tronçons (Media3 `SimpleCache`), sans que le cœur n'en dépende. */
fun interface CachedSpanProbe {
    /** Vrai quand la ressource [key] est présente en entier dans le cache de [category]. */
    fun isFullyCached(category: MediaCacheCategory, key: String): Boolean
}

/**
 * Répond à « ce média est-il déjà là, lisible sans réseau ? ». Un fichier posé sous sa clé
 * canonique dans le dossier de la catégorie (images, vignettes) répond directement ; l'audio et la
 * vidéo, stockés en tronçons, sont interrogés par la [spanProbe] du cache qui les possède.
 */
class LocalMediaFileResolver(
    private val dirs: MediaCacheDirs,
    private val spanProbe: CachedSpanProbe = CachedSpanProbe { _, _ -> false },
) {
    /** Le fichier entier sous sa clé canonique, ou `null` (jamais un tronçon). */
    fun fileFor(category: MediaCacheCategory, url: String): File? =
        File(dirs.dirFor(category), MediaCacheKey.of(url)).takeIf { it.isFile && it.length() > 0L }

    fun isCached(category: MediaCacheCategory, url: String): Boolean =
        fileFor(category, url) != null || spanProbe.isFullyCached(category, MediaCacheKey.of(url))
}
