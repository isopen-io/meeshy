package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class GlobalSearchResultRowsTest {

    private val now = 1_800_000_000_000L
    private val past = "2020-01-01T00:00:00.000Z"
    private val future = "2999-01-01T00:00:00.000Z"

    private fun last(
        blurred: Boolean = false,
        viewOnce: Boolean = false,
        expiresAt: String? = null,
    ) = ApiConversationLastMessage(
        id = "m1",
        content = "secret",
        isBlurred = blurred,
        isViewOnce = viewOnce,
        expiresAt = expiresAt,
    )

    @Test
    fun `a blurred last message reads as hidden and never leaks its text`() {
        assertThat(GlobalSearchRows.protection(last(blurred = true), now)).isEqualTo(RowProtection.HIDDEN)
    }

    @Test
    fun `a view-once last message reads as view once`() {
        assertThat(GlobalSearchRows.protection(last(viewOnce = true), now)).isEqualTo(RowProtection.VIEW_ONCE)
    }

    @Test
    fun `an expired last message outranks every other flag`() {
        assertThat(GlobalSearchRows.protection(last(blurred = true, viewOnce = true, expiresAt = past), now))
            .isEqualTo(RowProtection.EXPIRED)
    }

    @Test
    fun `a plain or still ephemeral message shows its preview`() {
        assertThat(GlobalSearchRows.protection(last(), now)).isNull()
        assertThat(GlobalSearchRows.protection(last(expiresAt = future), now)).isNull()
        assertThat(GlobalSearchRows.protection(null, now)).isNull()
    }

    @Test
    fun `message accessibility label composes sender conversation and content`() {
        val label = GlobalSearchRows.messageLabel(
            template = "Message from %1\$s in %2\$s, %3\$s",
            sender = "Ana",
            conversation = "Team",
            content = "hello",
        )
        assertThat(label).isEqualTo("Message from Ana in Team, hello")
    }

    @Test
    fun `tab label announces the result count`() {
        assertThat(GlobalSearchRows.tabLabel("Messages", 3, "%1\$s, %2\$d results"))
            .isEqualTo("Messages, 3 results")
    }

    @Test
    fun `counts above 99 are capped for the badge`() {
        assertThat(GlobalSearchRows.badge(120)).isEqualTo("99+")
        assertThat(GlobalSearchRows.badge(7)).isEqualTo("7")
    }

    @Test
    fun `presence maps online to a dot and offline to none`() {
        assertThat(GlobalSearchRows.presence(true)).isEqualTo(PresenceState.ONLINE)
        assertThat(GlobalSearchRows.presence(false)).isNull()
        assertThat(GlobalSearchRows.presence(null)).isNull()
    }

    @Test
    fun `highlight is anchored on the query that produced the results`() {
        val segments = GlobalSearchRows.highlight(content = "Hello world", resultsQuery = "world")
        assertThat(segments.filter { it.highlighted }.map { it.text }).containsExactly("world")
    }

    @Test
    fun `user accessibility label names the handle and online status`() {
        assertThat(GlobalSearchRows.userLabel("Ana", "ana", online = true, onlineWord = "online"))
            .isEqualTo("Ana, @ana, online")
        assertThat(GlobalSearchRows.userLabel("Ana", "ana", online = false, onlineWord = "online"))
            .isEqualTo("Ana, @ana")
    }
}
