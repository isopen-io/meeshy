package me.meeshy.sdk.model

/**
 * #18915 (AND-05) — what changed in the « all » notification list WHILE a re-read waited for its page: the live
 * arrivals (`notification:new`, most recent first), the ids whose read state changed on this device (a gesture,
 * its echo, another device's read), the ids removed from it (a deletion from the socket, a deletion gesture, a
 * purge), and whether the server's own count arrived (`notification:counts`, #18908). The page was built before
 * them; it replaces everything else, never them.
 */
data class NotificationFlightChanges(
    val arrivals: List<ApiNotification> = emptyList(),
    val readChanged: Set<String> = emptySet(),
    val removed: Set<String> = emptySet(),
    val counted: Boolean = false,
) {
    fun arrived(notification: ApiNotification): NotificationFlightChanges =
        if (arrivals.any { it.id == notification.id }) this else copy(arrivals = listOf(notification) + arrivals)

    fun readChanged(ids: Set<String>): NotificationFlightChanges =
        if (ids.isEmpty()) this else copy(readChanged = readChanged + ids)

    fun removed(ids: Set<String>): NotificationFlightChanges =
        if (ids.isEmpty()) this else copy(removed = removed + ids)

    fun counted(): NotificationFlightChanges = if (counted) this else copy(counted = true)

    companion object {
        val NONE: NotificationFlightChanges = NotificationFlightChanges()

        /** The ids present on both sides of a write whose read state it flipped — a read, or the rollback of one. */
        fun readFlips(before: List<ApiNotification>, after: List<ApiNotification>): Set<String> {
            val readBefore = before.associate { it.id to it.state.isRead }
            return after.filter { item -> readBefore[item.id]?.let { it != item.state.isRead } == true }
                .mapTo(HashSet()) { it.id }
        }

        /** The ids a write took out of the list — a deletion, or a purge. */
        fun removals(before: List<ApiNotification>, after: List<ApiNotification>): Set<String> {
            val kept = after.mapTo(HashSet()) { it.id }
            return before.mapNotNullTo(HashSet()) { item -> item.id.takeUnless { it in kept } }
        }
    }
}

/** The list a re-read leaves, and the unread count to pose with it (`null`: the count was not obtained, keep the live one). */
data class NotificationLanding(
    val items: List<ApiNotification>,
    val unreadCount: Int?,
)

/**
 * #18915 (AND-05) — lands a re-read page over what changed during its flight. A snapshot the server built BEFORE an
 * arrival or a read can neither erase the one nor undo the other: REST pages only seed what the socket and the user
 * did not already settle (ARCHITECTURE.md, « never regress a socket-owned value »).
 */
object NotificationFlightLanding {

    /**
     * The [page] replaces the list, except what the flight changed:
     *  - an arrival the page does not serve stays at the head, as the [live] list holds it now — as it arrived when no
     *    list was loaded; an arrival removed from the live list during the flight does not come back;
     *  - a served notification whose read state changed on this device keeps its live state;
     *  - a served notification removed during the flight does not come back — unless the live list holds it again (a
     *    deletion refused, rolled back).
     * The served count ([servedUnread]) is corrected by what the server could not count yet: an unread arrival it does
     * not serve counts one more; a read posed on a row it served unread, one less (a rolled-back read, one more); a
     * removed row it served unread, one less. A count the server pushed during the flight (`notification:counts`) is
     * newer than the served one: the landing keeps the live count (`null`).
     *
     * ONE rule for the count during a flight (#19141 D4, #19048): [servedUnread] is the count the PAGE's own response
     * computed beside it, so an arrival the page does not serve is one the count does not hold either. A count from
     * another request cannot be ordered against an arrival — computed after it, it already holds it, and this correction
     * would count it twice — so the caller passes it only as a fallback, when the page carries none.
     */
    fun land(
        page: List<ApiNotification>,
        servedUnread: Int?,
        live: List<ApiNotification>?,
        changes: NotificationFlightChanges,
    ): NotificationLanding {
        val servedIds = page.mapTo(HashSet()) { it.id }
        val liveById = live?.associateBy { it.id }
        val kept = changes.arrivals
            .filterNot { it.id in servedIds }
            .mapNotNull { arrival -> if (liveById == null) arrival else liveById[arrival.id] }
        val (gone, staying) = page.partition { served -> served.id in changes.removed && liveById?.containsKey(served.id) != true }
        val relabeled = staying.map { served -> withLiveRead(served, liveById, changes.readChanged) }
        val delta = kept.sumOf { unread(it) } +
            staying.zip(relabeled).sumOf { (served, landed) -> unread(landed) - unread(served) } -
            gone.sumOf { unread(it) }
        return NotificationLanding(
            items = kept + relabeled,
            unreadCount = servedUnread?.takeUnless { changes.counted }?.let { (it + delta).coerceAtLeast(0) },
        )
    }

    private fun withLiveRead(
        served: ApiNotification,
        liveById: Map<String, ApiNotification>?,
        readChanged: Set<String>,
    ): ApiNotification {
        if (served.id !in readChanged) return served
        val liveRead = liveById?.get(served.id)?.state?.isRead ?: return served
        if (liveRead == served.state.isRead) return served
        return served.copy(state = served.state.copy(isRead = liveRead))
    }

    private fun unread(notification: ApiNotification): Int = if (notification.state.isRead) 0 else 1
}
