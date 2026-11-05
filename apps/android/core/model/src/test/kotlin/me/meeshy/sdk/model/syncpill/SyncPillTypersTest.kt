package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.connection.SyncPillTyper
import org.junit.Test

class SyncPillTypersTest {
    private fun event(conversation: String, user: String, username: String? = user, display: String? = null) =
        TypingEvent(conversationId = conversation, userId = user, username = username, displayName = display)

    @Test
    fun `a friend typing surfaces as one handle for the conversation`() {
        val state = SyncPillTypers.started(emptyMap(), event("c1", "u1", "ana"), selfId = "me")
        assertThat(SyncPillTypers.typers(state)).containsExactly(SyncPillTyper("c1", "ana"))
    }

    @Test
    fun `my own typing never shows`() {
        val state = SyncPillTypers.started(emptyMap(), event("c1", "me"), selfId = "me")
        assertThat(state).isEmpty()
    }

    @Test
    fun `the handle falls back to the display name then the id`() {
        assertThat(SyncPillTypers.typers(SyncPillTypers.started(emptyMap(), event("c1", "u1", username = null, display = "Ana B"), null)).single().username)
            .isEqualTo("Ana B")
        assertThat(SyncPillTypers.typers(SyncPillTypers.started(emptyMap(), event("c1", "u1", username = " ", display = null), null)).single().username)
            .isEqualTo("u1")
    }

    @Test
    fun `stopping one typer keeps the conversation lit while another types`() {
        var state = SyncPillTypers.started(emptyMap(), event("c1", "u1", "zed"), null)
        state = SyncPillTypers.started(state, event("c1", "u2", "ana"), null)
        assertThat(SyncPillTypers.typers(state).single().username).isEqualTo("ana")
        state = SyncPillTypers.stopped(state, "c1", "u2")
        assertThat(SyncPillTypers.typers(state).single().username).isEqualTo("zed")
        state = SyncPillTypers.stopped(state, "c1", "u1")
        assertThat(state).isEmpty()
    }

    @Test
    fun `stopping an absent typer returns the same state`() {
        val state = SyncPillTypers.started(emptyMap(), event("c1", "u1"), null)
        assertThat(SyncPillTypers.stopped(state, "c1", "ghost")).isSameInstanceAs(state)
        assertThat(SyncPillTypers.stopped(state, "c9", "u1")).isSameInstanceAs(state)
    }
}
