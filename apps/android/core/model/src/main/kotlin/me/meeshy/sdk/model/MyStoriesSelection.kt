package me.meeshy.sdk.model

/** Lois pures de la liste de « Mes stories » : sélection vivante et fusion tray + archive. */
object MyStoriesSelection {

    /**
     * La sélection filtrée contre les stories réellement affichées : une story supprimée
     * ailleurs pendant la sélection sort du lot, sans gonfler un compteur ni déclencher un
     * appel réseau voué à l'échec (port de `StorySelectionResolver.liveSelection`).
     */
    fun liveSelection(selectedIds: Set<String>, liveIds: Collection<String>): Set<String> =
        selectedIds.intersect(liveIds.toSet())

    /**
     * Fusionne les stories du plateau (servies en direct, qui gagnent) et celles de l'archive
     * drainée, sans doublon d'id, la plus récente d'abord.
     */
    fun merge(fresh: List<ApiPost>, archive: List<ApiPost>): List<ApiPost> {
        val byId = LinkedHashMap<String, ApiPost>()
        archive.forEach { byId[it.id] = it }
        fresh.forEach { byId[it.id] = it }
        return byId.values.sortedByDescending { isoToEpochMillis(it.createdAt) }
    }
}
