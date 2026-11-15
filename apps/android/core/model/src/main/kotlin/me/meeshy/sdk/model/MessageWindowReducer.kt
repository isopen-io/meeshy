package me.meeshy.sdk.model

/** Les transitions pures entre [MessageWindowMode]. Un no-op rend la MÊME instance (aucune republication). */
public object MessageWindowReducer {

    /** [pagedCount] lignes plus anciennes viennent d'entrer dans le cache, la plus ancienne à [oldestPagedMillis]. */
    public fun loadOlder(mode: MessageWindowMode, pagedCount: Int, oldestPagedMillis: Long?): MessageWindowMode = when (mode) {
        is MessageWindowMode.Latest ->
            if (pagedCount <= 0) mode else mode.copy(limit = mode.limit + pagedCount)
        is MessageWindowMode.Jumped ->
            if (oldestPagedMillis == null || oldestPagedMillis >= mode.fromMillis) mode else mode.copy(fromMillis = oldestPagedMillis)
        is MessageWindowMode.Search -> mode
    }

    /** Ouvre la fenêtre sur un ancien message ; [throughMillis] `null` quand le présent est déjà dans la fenêtre. */
    public fun jump(anchorId: String, fromMillis: Long, throughMillis: Long?): MessageWindowMode.Jumped =
        MessageWindowMode.Jumped(anchorId, fromMillis, throughMillis)

    /** Une page plus récente est entrée : le bord récent avance, ou se libère au présent. Jamais de recul. */
    public fun loadNewer(mode: MessageWindowMode, newestPagedMillis: Long?, reachedPresent: Boolean): MessageWindowMode {
        if (mode !is MessageWindowMode.Jumped) return mode
        val through = mode.throughMillis ?: return mode
        return when {
            reachedPresent -> mode.copy(throughMillis = null)
            newestPagedMillis != null && newestPagedMillis > through -> mode.copy(throughMillis = newestPagedMillis)
            else -> mode
        }
    }

    /** « Retour au présent » (et sortie de recherche) : la fenêtre des plus récents. */
    public fun restoreLatest(mode: MessageWindowMode): MessageWindowMode =
        if (mode is MessageWindowMode.Latest) mode else MessageWindowMode.Latest()

    /** Entre en recherche sur ces ids ; une liste vide laisse le mode courant. */
    public fun enterSearch(mode: MessageWindowMode, ids: List<String>): MessageWindowMode {
        val distinct = ids.distinct()
        return if (distinct.isEmpty()) mode else MessageWindowMode.Search(distinct)
    }
}
