package me.meeshy.sdk.model.mediacache

/** Un fichier du cache vu par le plan d'éviction. */
public data class CachedFileInfo(
    val key: String,
    val sizeBytes: Long,
    val lastAccessEpochMillis: Long,
)

/**
 * Plan d'éviction LRU : choisit les victimes du plus ancien au plus récent jusqu'à repasser sous
 * le budget, sans jamais viser une épingle active ni un téléchargement en cours. Si tout est
 * protégé, le plan est incomplet — il se résorbe à l'échéance des épingles. Égalités d'accès
 * départagées par la clé pour un résultat déterministe.
 */
public object LruEvictionPlan {
    public fun victims(
        files: List<CachedFileInfo>,
        budgetBytes: Long,
        pins: MediaPinTable,
        nowEpochMillis: Long,
        inFlightKeys: Set<String> = emptySet(),
    ): List<String> {
        var total = files.sumOf { it.sizeBytes }
        if (total <= budgetBytes) return emptyList()
        val chosen = mutableListOf<String>()
        val candidates = files
            .filterNot { it.key in inFlightKeys || pins.isPinned(it.key, nowEpochMillis) }
            .sortedWith(compareBy<CachedFileInfo> { it.lastAccessEpochMillis }.thenBy { it.key })
        for (file in candidates) {
            if (total <= budgetBytes) break
            chosen += file.key
            total -= file.sizeBytes
        }
        return chosen
    }
}
