package me.meeshy.sdk.model.mediacache

/**
 * Budgets du cache média typé, alignés sur `CachePolicy.media*` / `thumbnails` et sur le L1 de
 * `DiskCacheStore` (iOS) : images 300 Mo, audio 200 Mo, vidéo 1 Go, vignettes 150 Mo ; L1 de
 * 80 Mo, réduit à 8 Mo pour l'audio et la vidéo (leurs plafonds théoriques cumulés dépasseraient
 * à eux seuls la cible mémoire de l'app).
 */
public data class MediaCacheBudget(
    val diskMaxBytes: Long,
    val memoryMaxBytes: Long,
) {
    /** Une entrée unique de plus de la moitié du L1 n'y entre pas : elle évincerait tout le reste. */
    public fun fitsInMemory(entryBytes: Long): Boolean = entryBytes <= memoryMaxBytes / 2

    public companion object {
        private const val MB: Long = 1_000_000L
        private const val MIB: Long = 1024L * 1024L
        private const val DEFAULT_MEMORY: Long = 80 * MIB
        private const val REDUCED_MEMORY: Long = 8 * MIB

        public fun of(category: MediaCacheCategory): MediaCacheBudget = when (category) {
            MediaCacheCategory.IMAGES -> MediaCacheBudget(300 * MB, DEFAULT_MEMORY)
            MediaCacheCategory.AUDIO -> MediaCacheBudget(200 * MB, REDUCED_MEMORY)
            MediaCacheCategory.VIDEO -> MediaCacheBudget(1_000 * MB, REDUCED_MEMORY)
            MediaCacheCategory.THUMBNAILS -> MediaCacheBudget(150 * MB, DEFAULT_MEMORY)
        }
    }
}
