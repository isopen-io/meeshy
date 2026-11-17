package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #18915 (AND-05) — a re-read page lands over what changed during its flight: it replaces everything else, never an
 * arrival or a read the server could not know when it built the page.
 */
class NotificationFlightLandingTest {

    private fun notification(id: String, isRead: Boolean = false) =
        ApiNotification(id = id, state = NotificationState(isRead = isRead, createdAt = "2026-11-17T09:00:00.000Z"))

    private fun List<ApiNotification>.ids() = map { it.id }

    @Test
    fun `with nothing changed during the flight the page replaces the list and its count`() {
        val landing = NotificationFlightLanding.land(
            page = listOf(notification("a"), notification("b", isRead = true)),
            servedUnread = 7,
            live = listOf(notification("gone"), notification("a")),
            changes = NotificationFlightChanges.NONE,
        )

        assertThat(landing.items.ids()).containsExactly("a", "b").inOrder()
        assertThat(landing.unreadCount).isEqualTo(7)
    }

    @Test
    fun `an arrival the page does not serve stays at the head and counts one more`() {
        val arrival = notification("n2")

        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1")),
            servedUnread = 1,
            live = listOf(arrival, notification("n1")),
            changes = NotificationFlightChanges.NONE.arrived(arrival),
        )

        assertThat(landing.items.ids()).containsExactly("n2", "n1").inOrder()
        assertThat(landing.unreadCount).isEqualTo(2)
    }

    @Test
    fun `an arrival the page already serves is counted once, by the server`() {
        val arrival = notification("n2")

        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n2"), notification("n1")),
            servedUnread = 2,
            live = listOf(arrival, notification("n1")),
            changes = NotificationFlightChanges.NONE.arrived(arrival),
        )

        assertThat(landing.items.ids()).containsExactly("n2", "n1").inOrder()
        assertThat(landing.unreadCount).isEqualTo(2)
    }

    @Test
    fun `an arrival read during the flight stays, read, and adds nothing to the count`() {
        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1")),
            servedUnread = 1,
            live = listOf(notification("n2", isRead = true), notification("n1")),
            changes = NotificationFlightChanges.NONE.arrived(notification("n2")).readChanged(setOf("n2")),
        )

        assertThat(landing.items.ids()).containsExactly("n2", "n1").inOrder()
        assertThat(landing.items.first().state.isRead).isTrue()
        assertThat(landing.unreadCount).isEqualTo(1)
    }

    @Test
    fun `an arrival removed during the flight does not come back`() {
        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1")),
            servedUnread = 1,
            live = listOf(notification("n1")),
            changes = NotificationFlightChanges.NONE.arrived(notification("n2")),
        )

        assertThat(landing.items.ids()).containsExactly("n1")
        assertThat(landing.unreadCount).isEqualTo(1)
    }

    @Test
    fun `an arrival during a flight with no list loaded joins the page it lands with`() {
        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1")),
            servedUnread = 1,
            live = null,
            changes = NotificationFlightChanges.NONE.arrived(notification("n2")),
        )

        assertThat(landing.items.ids()).containsExactly("n2", "n1").inOrder()
        assertThat(landing.unreadCount).isEqualTo(2)
    }

    @Test
    fun `a read posed during the flight survives a page built before it, and leaves the count`() {
        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1"), notification("n0")),
            servedUnread = 2,
            live = listOf(notification("n1", isRead = true), notification("n0")),
            changes = NotificationFlightChanges.NONE.readChanged(setOf("n1")),
        )

        assertThat(landing.items.map { it.id to it.state.isRead }).containsExactly("n1" to true, "n0" to false).inOrder()
        assertThat(landing.unreadCount).isEqualTo(1)
    }

    @Test
    fun `a read the page already reflects changes nothing`() {
        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1", isRead = true)),
            servedUnread = 0,
            live = listOf(notification("n1", isRead = true)),
            changes = NotificationFlightChanges.NONE.readChanged(setOf("n1")),
        )

        assertThat(landing.items.single().state.isRead).isTrue()
        assertThat(landing.unreadCount).isEqualTo(0)
    }

    @Test
    fun `a count that was not obtained stays the live one`() {
        val arrival = notification("n2")

        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1")),
            servedUnread = null,
            live = listOf(arrival, notification("n1")),
            changes = NotificationFlightChanges.NONE.arrived(arrival),
        )

        assertThat(landing.unreadCount).isNull()
        assertThat(landing.items.ids()).containsExactly("n2", "n1").inOrder()
    }

    @Test
    fun `a write that flips a read is journaled by its id, any other write is not`() {
        val before = listOf(notification("a"), notification("b", isRead = true), notification("c"))
        val after = listOf(notification("a", isRead = true), notification("b", isRead = false), notification("c"), notification("d"))

        assertThat(NotificationFlightChanges.readFlips(before, after)).containsExactly("a", "b")
        assertThat(NotificationFlightChanges.readFlips(before, before)).isEmpty()
    }

    @Test
    fun `a notification removed during the flight does not come back with the page built before, nor in its count`() {
        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1"), notification("n2")),
            servedUnread = 2,
            live = listOf(notification("n1")),
            changes = NotificationFlightChanges.NONE.removed(setOf("n2")),
        )

        assertThat(landing.items.ids()).containsExactly("n1")
        assertThat(landing.unreadCount).isEqualTo(1)
    }

    @Test
    fun `a removal undone during the flight keeps the row the page serves`() {
        val landing = NotificationFlightLanding.land(
            page = listOf(notification("n1"), notification("n2")),
            servedUnread = 2,
            live = listOf(notification("n1"), notification("n2")),
            changes = NotificationFlightChanges.NONE.removed(setOf("n2")),
        )

        assertThat(landing.items.ids()).containsExactly("n1", "n2").inOrder()
        assertThat(landing.unreadCount).isEqualTo(2)
    }

    @Test
    fun `a write that removes rows is journaled by their ids, any other write is not`() {
        val before = listOf(notification("a"), notification("b", isRead = true), notification("c"))
        val after = listOf(notification("c", isRead = true), notification("d"))

        assertThat(NotificationFlightChanges.removals(before, after)).containsExactly("a", "b")
        assertThat(NotificationFlightChanges.removals(before, before)).isEmpty()
    }

    @Test
    fun `an arrival journaled twice is kept once`() {
        val changes = NotificationFlightChanges.NONE.arrived(notification("n2")).arrived(notification("n2"))

        assertThat(changes.arrivals.ids()).containsExactly("n2")
    }
}
