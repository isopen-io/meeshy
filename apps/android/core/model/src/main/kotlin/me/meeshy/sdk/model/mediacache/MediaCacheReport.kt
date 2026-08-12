package me.meeshy.sdk.model.mediacache

/**
 * The four disk-backed media cache categories, mirroring the iOS `CacheCoordinator` stores
 * (images / audio / video / thumbnails). Declaration order is the canonical display order.
 */
public enum class MediaCacheCategory {
    IMAGES,
    AUDIO,
    VIDEO,
    THUMBNAILS,
}

/**
 * Pure, immutable snapshot of the on-disk media cache — the single source of truth for a
 * per-category byte size, the derived [totalBytes] and [isEmpty], and the optimistic
 * [withCleared] projection the ViewModel applies before the disk delete confirms.
 *
 * Always construct via [of] (or [EMPTY]) so every category is present and every size is
 * clamped non-negative; [bytesFor] defends the same invariant for any directly-built map.
 */
public data class MediaCacheReport(
    val bytesByCategory: Map<MediaCacheCategory, Long>,
) {
    public fun bytesFor(category: MediaCacheCategory): Long =
        (bytesByCategory[category] ?: 0L).coerceAtLeast(0L)

    public val totalBytes: Long
        get() = MediaCacheCategory.entries.sumOf { bytesFor(it) }

    public val isEmpty: Boolean
        get() = totalBytes == 0L

    /** Categories that currently hold bytes, in canonical display order. */
    public val nonEmptyCategories: List<MediaCacheCategory>
        get() = MediaCacheCategory.entries.filter { bytesFor(it) > 0L }

    /** Optimistic projection: zero the given categories, keep the rest. Inert on an empty set. */
    public fun withCleared(categories: Set<MediaCacheCategory>): MediaCacheReport {
        if (categories.isEmpty()) return this
        return copy(
            bytesByCategory = MediaCacheCategory.entries.associateWith {
                if (it in categories) 0L else bytesFor(it)
            },
        )
    }

    public companion object {
        public val EMPTY: MediaCacheReport = of(emptyMap())

        public fun of(bytes: Map<MediaCacheCategory, Long>): MediaCacheReport =
            MediaCacheReport(
                MediaCacheCategory.entries.associateWith { (bytes[it] ?: 0L).coerceAtLeast(0L) },
            )
    }
}
