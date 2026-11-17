package me.meeshy.sdk.model

/**
 * #18930 — the realtime mood deltas folded into a list of moods, iso iOS (`StatusViewModel.subscribeToSocketEvents`): the
 * single fold the statuses bar and the conversation list's row moods both apply. Each one keeps the SAME list instance when
 * it changes nothing, so a redundant or foreign delta never churns the state that holds it.
 */
object StatusEntryFold {

    /** `status:created` — joins the front, unless a mood with that id is already held (the publisher's own echo). */
    fun onCreated(statuses: List<StatusEntry>, entry: StatusEntry): List<StatusEntry> =
        if (statuses.any { it.id == entry.id }) statuses else listOf(entry) + statuses

    /** `status:updated` — replaces the mood in place; a mood not held is never smuggled in. */
    fun onUpdated(statuses: List<StatusEntry>, entry: StatusEntry): List<StatusEntry> {
        val index = statuses.indexOfFirst { it.id == entry.id }
        if (index < 0) return statuses
        return statuses.toMutableList().also { it[index] = entry }
    }

    /** `status:deleted` — the mood leaves. */
    fun onDeleted(statuses: List<StatusEntry>, statusId: String): List<StatusEntry> =
        if (statuses.none { it.id == statusId }) statuses else statuses.filterNot { it.id == statusId }
}
