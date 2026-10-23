package me.meeshy.sdk.model.session

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SessionsListReducerTest {

    private fun s(id: String, current: Boolean = false) = UserSession(id = id, isCurrentSession = current)

    private val list = listOf(s("cur", true), s("a"), s("b"), s("c"))

    private fun ids(l: List<UserSession>) = l.map { it.id }

    @Test
    fun `revoquer retire la ligne et la restauration la remet a son index`() {
        val out = SessionsListReducer.revoke(list, "b")
        assertThat(ids(out.sessions)).containsExactly("cur", "a", "c").inOrder()
        assertThat(ids(SessionsListReducer.restore(out.sessions, out.removed))).containsExactly("cur", "a", "b", "c").inOrder()
    }

    @Test
    fun `revoquer la courante ou un id inconnu est inerte`() {
        assertThat(SessionsListReducer.revoke(list, "cur").sessions).isEqualTo(list)
        assertThat(SessionsListReducer.revoke(list, "zzz").removed).isEmpty()
    }

    @Test
    fun `revoquer les autres ne garde que la courante et se restaure entierement`() {
        val out = SessionsListReducer.revokeOthers(list)
        assertThat(ids(out.sessions)).containsExactly("cur")
        assertThat(SessionsListReducer.restore(out.sessions, out.removed)).isEqualTo(list)
    }

    @Test
    fun `la restauration garde une relecture arrivee entre temps et ne duplique pas`() {
        val out = SessionsListReducer.revoke(list, "a")
        val refreshed = out.sessions + s("new")
        val restored = SessionsListReducer.restore(refreshed, out.removed)
        assertThat(ids(restored)).containsExactly("cur", "a", "b", "c", "new").inOrder()
        assertThat(SessionsListReducer.restore(list, out.removed)).isEqualTo(list)
    }

    @Test
    fun `un index hors bornes est ramene a la fin`() {
        val restored = SessionsListReducer.restore(listOf(s("cur", true)), listOf(SessionsListReducer.Removed(s("a"), 9)))
        assertThat(ids(restored)).containsExactly("cur", "a").inOrder()
    }
}
