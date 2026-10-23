package me.meeshy.sdk.model.session

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SessionsOrderingTest {

    private fun session(id: String, last: String? = null, created: String? = null, current: Boolean = false) =
        UserSession(id = id, lastActivityAt = last, createdAt = created, isCurrentSession = current)

    private fun ids(list: List<UserSession>) = SessionsOrdering.ordered(list).map { it.id }

    @Test
    fun `la session courante passe en premier meme la plus ancienne`() {
        val list = listOf(
            session("recent", last = "2026-10-02T00:00:00Z"),
            session("cur", last = "2026-01-01T00:00:00Z", current = true),
        )
        assertThat(ids(list)).containsExactly("cur", "recent").inOrder()
    }

    @Test
    fun `les autres sont par activite decroissante`() {
        val list = listOf(
            session("a", last = "2026-10-01T00:00:00Z"),
            session("b", last = "2026-10-03T00:00:00Z"),
            session("c", last = "2026-10-02T00:00:00Z"),
        )
        assertThat(ids(list)).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `sans activite la date d ouverture tient lieu`() {
        val list = listOf(
            session("a", created = "2026-09-01T00:00:00Z"),
            session("b", created = "2026-09-05T00:00:00Z"),
        )
        assertThat(ids(list)).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `l egalite garde l ordre du serveur`() {
        val list = listOf(session("x", last = "2026-10-01T00:00:00Z"), session("y", last = "2026-10-01T00:00:00Z"), session("z", last = "2026-10-01T00:00:00Z"))
        assertThat(ids(list)).containsExactly("x", "y", "z").inOrder()
    }
}
