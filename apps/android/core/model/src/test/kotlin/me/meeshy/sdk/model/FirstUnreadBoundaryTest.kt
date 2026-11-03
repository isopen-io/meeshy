package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FirstUnreadBoundaryTest {

    private fun msg(id: String, at: Long, sender: String = "other") = FirstUnreadCandidate(id, sender, at)

    private fun resolve(
        messages: List<FirstUnreadCandidate>,
        lastReadMessageId: String? = null,
        lastReadAt: Long? = null,
        lastReadCreatedAt: Long? = null,
        joinedAt: Long? = null,
        hint: Int? = null,
    ) = FirstUnreadBoundary.resolve(messages, lastReadMessageId, lastReadAt, lastReadCreatedAt, joinedAt, "me", hint)

    @Test
    fun `the first message of another reader strictly after the cursor is elected`() {
        val result = resolve(listOf(msg("a", 1), msg("b", 2), msg("c", 3)), lastReadCreatedAt = 1)
        assertThat(result).isEqualTo(FirstUnreadBoundary.Result("b", 2))
    }

    @Test
    fun `the cursor message itself is excluded even when the clock disagrees`() {
        val result = resolve(listOf(msg("a", 5), msg("b", 6)), lastReadMessageId = "a", lastReadCreatedAt = 1)
        assertThat(result?.firstUnreadId).isEqualTo("b")
    }

    @Test
    fun `nothing unread gives no boundary`() {
        assertThat(resolve(listOf(msg("a", 1), msg("b", 2)), lastReadCreatedAt = 2)).isNull()
    }

    @Test
    fun `a message of the viewer is never elected nor counted`() {
        val result = resolve(listOf(msg("a", 1, "me"), msg("b", 2), msg("c", 3, "me")), lastReadCreatedAt = 0)
        assertThat(result).isEqualTo(FirstUnreadBoundary.Result("b", 1))
    }

    @Test
    fun `ranks descend from lastReadMessageCreatedAt to lastReadAt to joinedAt`() {
        val window = listOf(msg("a", 10), msg("b", 20), msg("c", 30))
        assertThat(resolve(window, lastReadCreatedAt = 20, lastReadAt = 5, joinedAt = 1)?.firstUnreadId).isEqualTo("c")
        assertThat(resolve(window, lastReadAt = 10, joinedAt = 1)?.firstUnreadId).isEqualTo("b")
        assertThat(resolve(window, joinedAt = 20)?.firstUnreadId).isEqualTo("c")
    }

    @Test
    fun `equal createdAt is broken by id deterministically`() {
        val result = resolve(listOf(msg("z", 5), msg("a", 5)), lastReadCreatedAt = 1)
        assertThat(result?.firstUnreadId).isEqualTo("a")
    }

    @Test
    fun `without any rank the server count places the boundary on the last N candidates`() {
        val window = listOf(msg("a", 1), msg("b", 2), msg("c", 3), msg("d", 4))
        assertThat(resolve(window, hint = 2)).isEqualTo(FirstUnreadBoundary.Result("c", 2))
        assertThat(resolve(window, hint = 0)).isNull()
        assertThat(resolve(window, hint = 99)?.firstUnreadId).isEqualTo("a")
        assertThat(resolve(window)?.firstUnreadId).isEqualTo("a")
    }

    @Test
    fun `as soon as a rank exists the hint is ignored even at zero`() {
        val window = listOf(msg("a", 1), msg("b", 2), msg("c", 3))
        assertThat(resolve(window, joinedAt = 1, hint = 0)?.firstUnreadId).isEqualTo("b")
        assertThat(resolve(window, lastReadAt = 1, hint = 1)?.firstUnreadId).isEqualTo("b")
    }
}
