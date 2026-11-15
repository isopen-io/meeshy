package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.UserUpdatedEvent
import org.junit.Test

class PendingRequestRosterTest {
    private fun request(id: String, status: String = "pending") = FriendRequest(id = id, status = status)

    @Test
    fun `only pending requests are listed`() {
        val kept = PendingRequestRoster.pendingOnly(listOf(request("a"), request("b", "accepted"), request("c", "rejected")))
        assertThat(kept.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a next page adds only what is not already shown, in order`() {
        val merged = PendingRequestRoster.appendingNew(
            shown = listOf(request("a"), request("b")),
            page = listOf(request("b"), request("c"), request("c"), request("d", "accepted")),
        )
        assertThat(merged.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `a refused row returns alone at its place and is never doubled`() {
        val removal = RequestRemoval.of("b", listOf(request("a"), request("b"), request("c")))!!
        val after = listOf(request("a"), request("c"), request("z"))
        val restored = PendingRequestRoster.restoring(removal.request, removal.index, after)
        assertThat(restored.map { it.id }).containsExactly("a", "b", "c", "z").inOrder()
        assertThat(PendingRequestRoster.restoring(removal.request, removal.index, restored)).isEqualTo(restored)
    }

    @Test
    fun `removal of an unknown row is null`() {
        assertThat(RequestRemoval.of("x", listOf(request("a")))).isNull()
    }

    @Test
    fun `a user update repaints the touched rows and leaves an untouched list alone`() {
        val rows = listOf(FriendRequest(id = "r", sender = FriendRequestUser(id = "u1", username = "old")))
        val event = UserUpdatedEvent(userId = "u1", username = "new", hasNameGroup = true)
        assertThat(PendingRequestRoster.repainted(rows, event)!!.single().sender!!.username).isEqualTo("new")
        assertThat(PendingRequestRoster.repainted(rows, UserUpdatedEvent(userId = "other"))).isNull()
    }

    @Test
    fun `graph delta tells arrivals from returns of rows we removed and from departures`() {
        val delta = PendingGraphDelta.between(
            previous = setOf("a", "b"),
            current = setOf("b", "c", "d"),
            removedByUs = setOf("d"),
        )
        assertThat(delta.arrived).containsExactly("c")
        assertThat(delta.returned).containsExactly("d")
        assertThat(delta.gone).containsExactly("a")
        assertThat(PendingGraphDelta.between(setOf("a"), setOf("a"), emptySet()).isEmpty).isTrue()
    }
}
