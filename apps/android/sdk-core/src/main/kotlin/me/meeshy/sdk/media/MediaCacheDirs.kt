package me.meeshy.sdk.media

import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import java.io.File

/**
 * Dossiers disque du cache média typé, un par catégorie, sous une racine unique. Les vignettes
 * vivent dans le cache purgeable de l'OS, le reste dans le stockage durable (comme iOS).
 */
class MediaCacheDirs(
    private val durableRoot: File,
    private val purgeableRoot: File,
) {
    fun dirFor(category: MediaCacheCategory): File {
        val root = if (category == MediaCacheCategory.THUMBNAILS) purgeableRoot else durableRoot
        return File(root, "media-cache/${subdir(category)}")
    }

    private fun subdir(category: MediaCacheCategory): String = when (category) {
        MediaCacheCategory.IMAGES -> "Images"
        MediaCacheCategory.AUDIO -> "Audio"
        MediaCacheCategory.VIDEO -> "Video"
        MediaCacheCategory.THUMBNAILS -> "Thumbnails"
    }

    /**
     * Racine du `SimpleCache` Media3 d'une catégorie : un sous-dossier, pour que le sidecar
     * d'épingles (`.pins.json`, posé dans [dirFor]) ne se mêle pas aux tronçons que Media3
     * possède seul et nettoie à l'initialisation.
     */
    fun spansDirFor(category: MediaCacheCategory): File = File(dirFor(category), "spans")
}
