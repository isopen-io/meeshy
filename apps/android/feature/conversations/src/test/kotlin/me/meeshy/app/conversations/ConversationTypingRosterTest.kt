package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.TypingEvent
import org.junit.Test

class ConversationTypingRosterTest {

    private fun start(
        conversationId: String = "c1",
        userId: String = "u1",
        username: String? = "alice",
        displayName: String? = "Alice",
    ) = TypingEvent(
        conversationId = conversationId,
        userId = userId,
        username = username,
        displayName = displayName,
    )

    private val empty: Map<String, Map<String, ConversationTyper>> = emptyMap()

    @Test
    fun `started records a typer under its conversation`() {
        val state = ConversationTypingRoster.started(empty, start(), selfId = "me")

        assertThat(state.keys).containsExactly("c1")
        assertThat(state.getValue("c1").getValue("u1")).isEqualTo(ConversationTyper("u1", "Alice"))
    }

    @Test
    fun `started prefers displayName over username`() {
        val state = ConversationTypingRoster.started(empty, start(displayName = "Alice A."), selfId = null)

        assertThat(ConversationTypingRoster.typingDisplayName(state, "c1")).isEqualTo("Alice A.")
    }

    @Test
    fun `started falls back to username when displayName is blank or null`() {
        val nullName = ConversationTypingRoster.started(empty, start(displayName = null), null)
        val blankName = ConversationTypingRoster.started(empty, start(displayName = "  "), null)

        assertThat(ConversationTypingRoster.typingDisplayName(nullName, "c1")).isEqualTo("alice")
        assertThat(ConversationTypingRoster.typingDisplayName(blankName, "c1")).isEqualTo("alice")
    }

    @Test
    fun `started falls back to userId when both names are absent`() {
        val state = ConversationTypingRoster.started(empty, start(username = null, displayName = null), null)

        assertThat(ConversationTypingRoster.typingDisplayName(state, "c1")).isEqualTo("u1")
    }

    @Test
    fun `started excludes the local user and returns the same instance`() {
        val state = ConversationTypingRoster.started(empty, start(userId = "me"), selfId = "me")

        assertThat(state).isSameInstanceAs(empty)
    }

    @Test
    fun `started ignores a blank conversation id or blank user id inertly`() {
        val blankConv = ConversationTypingRoster.started(empty, start(conversationId = ""), "me")
        val blankUser = ConversationTypingRoster.started(empty, start(userId = ""), "me")

        assertThat(blankConv).isSameInstanceAs(empty)
        assertThat(blankUser).isSameInstanceAs(empty)
    }

    @Test
    fun `a repeated start from the same user refreshes the resolved name in place`() {
        val first = ConversationTypingRoster.started(empty, start(displayName = "Alice"), null)
        val second = ConversationTypingRoster.started(first, start(displayName = "Alice B."), null)

        assertThat(second.getValue("c1")).hasSize(1)
        assertThat(second.getValue("c1").getValue("u1").displayName).isEqualTo("Alice B.")
    }

    @Test
    fun `two typers in one conversation both remain and are selected deterministically`() {
        val one = ConversationTypingRoster.started(empty, start(userId = "u2", displayName = "Bob"), null)
        val two = ConversationTypingRoster.started(one, start(userId = "u1", displayName = "Alice"), null)

        assertThat(two.getValue("c1")).hasSize(2)
        // Sorted by displayName then userId → "Alice" wins regardless of insertion order.
        assertThat(ConversationTypingRoster.typingDisplayName(two, "c1")).isEqualTo("Alice")
    }

    @Test
    fun `deterministic selection breaks a displayName tie by userId`() {
        val one = ConversationTypingRoster.started(empty, start(userId = "u2", displayName = "Sam"), null)
        val two = ConversationTypingRoster.started(one, start(userId = "u1", displayName = "Sam"), null)

        assertThat(ConversationTypingRoster.typingDisplayName(two, "c1")).isEqualTo("Sam")
        // The tie resolves to the lower userId; proven by removing u1 and seeing the name persist.
        val afterU1Gone = ConversationTypingRoster.stopped(two, "c1", "u1")
        assertThat(afterU1Gone.getValue("c1").keys).containsExactly("u2")
    }

    @Test
    fun `stopped removes only that user and keeps the row lit for the rest`() {
        val one = ConversationTypingRoster.started(empty, start(userId = "u1", displayName = "Alice"), null)
        val two = ConversationTypingRoster.started(one, start(userId = "u2", displayName = "Bob"), null)

        val afterAlice = ConversationTypingRoster.stopped(two, "c1", "u1")

        assertThat(afterAlice.getValue("c1").keys).containsExactly("u2")
        assertThat(ConversationTypingRoster.typingDisplayName(afterAlice, "c1")).isEqualTo("Bob")
    }

    @Test
    fun `stopping the last typer drops the conversation key entirely`() {
        val one = ConversationTypingRoster.started(empty, start(userId = "u1"), null)

        val cleared = ConversationTypingRoster.stopped(one, "c1", "u1")

        assertThat(cleared).isEmpty()
    }

    @Test
    fun `stopped is inert for an unknown conversation or an absent user`() {
        val one = ConversationTypingRoster.started(empty, start(userId = "u1"), null)

        assertThat(ConversationTypingRoster.stopped(one, "other", "u1")).isSameInstanceAs(one)
        assertThat(ConversationTypingRoster.stopped(one, "c1", "ghost")).isSameInstanceAs(one)
        assertThat(ConversationTypingRoster.stopped(empty, "c1", "u1")).isSameInstanceAs(empty)
    }

    @Test
    fun `typing in one conversation never leaks into another`() {
        val one = ConversationTypingRoster.started(empty, start(conversationId = "c1", userId = "u1"), null)
        val two = ConversationTypingRoster.started(one, start(conversationId = "c2", userId = "u1"), null)

        assertThat(ConversationTypingRoster.typingDisplayName(two, "c1")).isEqualTo("Alice")
        assertThat(ConversationTypingRoster.typingDisplayName(two, "c2")).isEqualTo("Alice")
        // Stopping in c1 leaves c2 untouched.
        val afterC1 = ConversationTypingRoster.stopped(two, "c1", "u1")
        assertThat(afterC1.keys).containsExactly("c2")
    }

    @Test
    fun `typingDisplayName is null for a conversation nobody is typing in`() {
        assertThat(ConversationTypingRoster.typingDisplayName(empty, "c1")).isNull()
    }
}
