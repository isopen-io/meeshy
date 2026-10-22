package me.meeshy.sdk.model.composer

/** Ordered multi-selection of the recent-media grid — port of iOS `RecentMediaSelection`. */
data class RecentMediaSelection(
    val isActive: Boolean = false,
    val ids: List<String> = emptyList(),
) {
    val count: Int get() = ids.size
    val isEmpty: Boolean get() = ids.isEmpty()

    /** 1-based pick order shown in the badge, or null when not selected. */
    fun position(id: String): Int? = ids.indexOf(id).takeIf { it >= 0 }?.plus(1)

    fun begin(id: String): RecentMediaSelection =
        copy(isActive = true, ids = if (id in ids) ids else ids + id)

    fun activate(): RecentMediaSelection = copy(isActive = true)

    fun discard(attached: Set<String>): RecentMediaSelection = copy(ids = ids.filter { it !in attached })

    fun toggle(id: String): RecentMediaSelection = when {
        !isActive -> this
        id in ids -> copy(ids = ids - id)
        else -> copy(ids = ids + id)
    }

    fun clear(): RecentMediaSelection = RecentMediaSelection()
}
