package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationCachePatchTest {

    private fun notification(
        id: String,
        createdAt: String = "2026-08-17T00:00:00.000Z",
        isRead: Boolean = false,
        type: String = "new_message",
        conversationId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
        state = NotificationState(isRead = isRead, createdAt = createdAt),
        context = conversationId?.let { NotificationContext(conversationId = it) },
    )

    private fun List<ApiNotification>.ids() = map { it.id }

    @Test
    fun `marquer une ligne lue ne touche qu elle et garde l ordre`() {
        val items = listOf(notification("a"), notification("b"), notification("c"))

        val patched = NotificationCachePatch.markingRead(items, "b")

        assertThat(patched.ids()).containsExactly("a", "b", "c").inOrder()
        assertThat(patched.map { it.state.isRead }).containsExactly(false, true, false).inOrder()
    }

    @Test
    fun `marquer lue est idempotent et rend la meme liste quand rien ne change`() {
        val items = listOf(notification("a", isRead = true))

        assertThat(NotificationCachePatch.markingRead(items, "a")).isSameInstanceAs(items)
        assertThat(NotificationCachePatch.markingRead(items, "absent")).isSameInstanceAs(items)
    }

    @Test
    fun `tout lire passe chaque ligne a lue une seule fois`() {
        val items = listOf(notification("a"), notification("b", isRead = true))

        val patched = NotificationCachePatch.markingAllRead(items)

        assertThat(patched.all { it.state.isRead }).isTrue()
        assertThat(NotificationCachePatch.markingAllRead(patched)).isSameInstanceAs(patched)
    }

    @Test
    fun `le retour arriere rend non lue la seule ligne demandee`() {
        val items = listOf(notification("a", isRead = true), notification("b", isRead = true))

        val patched = NotificationCachePatch.markingUnread(items, "a")

        assertThat(patched.map { it.state.isRead }).containsExactly(false, true).inOrder()
        assertThat(NotificationCachePatch.markingUnread(patched, "a")).isEqualTo(patched)
    }

    @Test
    fun `retirer est idempotent`() {
        val items = listOf(notification("a"), notification("b"))

        val once = NotificationCachePatch.removing(items, "a")

        assertThat(once.ids()).containsExactly("b")
        assertThat(NotificationCachePatch.removing(once, "a")).isSameInstanceAs(once)
    }

    @Test
    fun `inserer en tete place la plus recente devant sans doublon`() {
        val items = listOf(notification("b", "2026-08-17T00:00:00.000Z"))

        val patched = NotificationCachePatch.insertingAtHead(items, notification("a", "2026-08-18T00:00:00.000Z"))

        assertThat(patched.ids()).containsExactly("a", "b").inOrder()
        assertThat(NotificationCachePatch.insertingAtHead(patched, notification("a"))).isSameInstanceAs(patched)
    }

    @Test
    fun `fusionner une page deduplique par id et trie du plus recent au plus ancien`() {
        val items = listOf(
            notification("n3", "2026-08-17T03:00:00.000Z"),
            notification("n2", "2026-08-17T02:00:00.000Z"),
        )
        val page = listOf(
            notification("n2", "2026-08-17T02:00:00.000Z", isRead = true),
            notification("n1", "2026-08-17T01:00:00.000Z"),
        )

        val merged = NotificationCachePatch.merging(items, page)

        assertThat(merged.ids()).containsExactly("n3", "n2", "n1").inOrder()
        assertThat(merged.first { it.id == "n2" }.state.isRead).isTrue()
        assertThat(NotificationCachePatch.merging(merged, page)).isEqualTo(merged)
    }

    @Test
    fun `le tri est stable a date egale`() {
        val same = "2026-08-17T00:00:00.000Z"

        val merged = NotificationCachePatch.merging(listOf(notification("x", same), notification("y", same)), listOf(notification("z", same)))

        assertThat(merged.ids()).containsExactly("x", "y", "z").inOrder()
    }

    @Test
    fun `le nombre de non lues se lit sur les lignes`() {
        val items = listOf(notification("a"), notification("b", isRead = true), notification("c"))

        assertThat(NotificationCachePatch.unreadCount(items)).isEqualTo(2)
    }
}
