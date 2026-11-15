package me.meeshy.sdk.model

/**
 * L'horloge des visites : à chaque réel affiché, le temps passé sur le précédent
 * et le sens du geste deviennent une [ReelPreloadWindow.Visit], filtrée et bornée
 * par [ReelPreloadWindow.recording]. Miroir de `ReelPreloadWindow.VisitClock`.
 */
public data class ReelVisitClock(
    val visits: List<ReelPreloadWindow.Visit> = emptyList(),
    private val currentIndex: Int? = null,
    private val sinceMs: Long? = null,
) {
    public fun enter(index: Int, nowMs: Long): ReelVisitClock {
        if (index == currentIndex) return this
        val previous = currentIndex
        val since = sinceMs
        val recorded = if (previous != null && since != null) {
            val direction = if (index > previous) ReelPreloadWindow.VisitDirection.FORWARD
            else ReelPreloadWindow.VisitDirection.BACKWARD
            ReelPreloadWindow.recording(
                ReelPreloadWindow.Visit(dwellMs = maxOf(0L, nowMs - since).toInt(), direction = direction),
                visits,
            )
        } else {
            visits
        }
        return copy(visits = recorded, currentIndex = index, sinceMs = nowMs)
    }
}
