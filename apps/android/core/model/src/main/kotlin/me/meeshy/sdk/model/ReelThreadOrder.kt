package me.meeshy.sdk.model

/**
 * L'ordre du fil des réels est STABLE sous le lecteur (#9702) — miroir de
 * `ReelThreadOrder` / `holdReelThread`. La passerelle reclasse une page à chaque
 * lecture ; remplacer la liste du pager par ce qu'elle sert déplacerait le réel
 * regardé.
 */
public object ReelThreadOrder {

    /**
     * Une relecture garde, à leur place, le réel regardé et tout ce qui le précède ;
     * elle ne réordonne que ce qui le SUIT. Chaque réel gardé prend sa donnée la plus récente.
     */
    public fun <T> refreshed(current: List<T>, anchorId: String?, served: List<T>, idOf: (T) -> String): List<T> {
        val anchorIndex = if (anchorId == null) -1 else current.indexOfFirst { idOf(it) == anchorId }
        if (anchorIndex < 0) return unique(served, idOf)
        val latest = LinkedHashMap<String, T>()
        served.forEach { latest.putIfAbsent(idOf(it), it) }
        val held = unique(current.take(anchorIndex + 1), idOf).map { latest[idOf(it)] ?: it }
        return unique(held + served, idOf)
    }

    /** Une page de plus s'ajoute en queue, dédoublonnée. */
    public fun <T> appended(current: List<T>, served: List<T>, idOf: (T) -> String): List<T> =
        unique(current + served, idOf)

    /** Le réel regardé et les identités à portée de la fenêtre ; change => la préparation est rejouée. */
    public data class PreloadScope<ID>(val anchorId: ID?, val neighbours: List<ID>)

    public fun <ID> preloadScope(
        ids: List<ID>,
        anchorId: ID?,
        radius: Int = ReelPreloadWindow.MAX_RADIUS,
    ): PreloadScope<ID> {
        val anchorIndex = if (anchorId == null) -1 else ids.indexOf(anchorId)
        if (anchorIndex < 0) return PreloadScope(anchorId, emptyList())
        val reach = maxOf(0, radius)
        val lower = maxOf(0, anchorIndex - reach)
        val upper = minOf(ids.size - 1, anchorIndex + reach)
        return PreloadScope(anchorId, ids.subList(lower, upper + 1).toList())
    }

    private fun <T> unique(items: List<T>, idOf: (T) -> String): List<T> {
        val seen = HashSet<String>()
        return items.filter { seen.add(idOf(it)) }
    }
}
