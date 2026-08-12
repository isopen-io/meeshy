package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

class MentionRosterTest {

    private fun participant(
        id: String,
        userId: String? = id,
        username: String? = "user-$id",
        displayName: String? = "User $id",
        avatar: String? = null,
    ) = ApiParticipant(
        id = id,
        userId = userId,
        username = username,
        displayName = displayName,
        avatar = avatar,
    )

    @Test
    fun `fromParticipants maps participants to candidates keyed by user id`() {
        val roster = MentionRoster.fromParticipants(
            listOf(participant(id = "p1", userId = "u1", username = "bob", displayName = "Bob")),
            excludeUserId = null,
        )

        val candidate = roster.single()
        assertThat(candidate.id).isEqualTo("u1")
        assertThat(candidate.username).isEqualTo("bob")
        assertThat(candidate.displayName).isEqualTo("Bob")
    }

    @Test
    fun `fromParticipants excludes the current user`() {
        val roster = MentionRoster.fromParticipants(
            listOf(
                participant(id = "p1", userId = "me", username = "atabeth"),
                participant(id = "p2", userId = "u2", username = "bob"),
            ),
            excludeUserId = "me",
        )

        assertThat(roster.map { it.username }).containsExactly("bob")
    }

    @Test
    fun `fromParticipants drops participants without a username`() {
        val roster = MentionRoster.fromParticipants(
            listOf(
                participant(id = "p1", username = null),
                participant(id = "p2", username = "   "),
                participant(id = "p3", username = "bob"),
            ),
            excludeUserId = null,
        )

        assertThat(roster.map { it.username }).containsExactly("bob")
    }

    @Test
    fun `fromParticipants degrades a missing display name to the username`() {
        val roster = MentionRoster.fromParticipants(
            listOf(participant(id = "p1", username = "bob", displayName = null)),
            excludeUserId = null,
        )

        assertThat(roster.single().displayName).isEqualTo("bob")
    }

    @Test
    fun `fromParticipants degrades a blank display name to the username`() {
        val roster = MentionRoster.fromParticipants(
            listOf(participant(id = "p1", username = "bob", displayName = "   ")),
            excludeUserId = null,
        )

        assertThat(roster.single().displayName).isEqualTo("bob")
    }

    @Test
    fun `fromParticipants falls back to the participant id when the user id is absent`() {
        val roster = MentionRoster.fromParticipants(
            listOf(participant(id = "p1", userId = null, username = "bob")),
            excludeUserId = null,
        )

        assertThat(roster.single().id).isEqualTo("p1")
    }

    @Test
    fun `fromParticipants carries the avatar url`() {
        val roster = MentionRoster.fromParticipants(
            listOf(participant(id = "p1", username = "bob", avatar = "https://a/b.png")),
            excludeUserId = null,
        )

        assertThat(roster.single().avatarURL).isEqualTo("https://a/b.png")
    }

    @Test
    fun `fromParticipants on an empty list is empty`() {
        assertThat(MentionRoster.fromParticipants(emptyList(), excludeUserId = "me")).isEmpty()
    }

    @Test
    fun `displayNames maps username to display name`() {
        val roster = MentionRoster.fromParticipants(
            listOf(
                participant(id = "p1", username = "bob", displayName = "Bob"),
                participant(id = "p2", username = "alice", displayName = "Alice"),
            ),
            excludeUserId = null,
        )

        assertThat(MentionRoster.displayNames(roster))
            .containsExactlyEntriesIn(mapOf("bob" to "Bob", "alice" to "Alice"))
    }
}
