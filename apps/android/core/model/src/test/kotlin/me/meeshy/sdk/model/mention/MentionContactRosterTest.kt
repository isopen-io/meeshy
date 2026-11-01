package me.meeshy.sdk.model.mention

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequestUser
import org.junit.Test

class MentionContactRosterTest {

    @Test
    fun `an accepted friend becomes a mention candidate with its display name`() {
        val roster = MentionContactRoster.fromFriends(
            friends = listOf(FriendRequestUser(id = "u1", username = " anna ", displayName = "Anna K", avatar = "a.png")),
            blocked = emptySet(),
        )
        assertThat(roster.single().id).isEqualTo("u1")
        assertThat(roster.single().username).isEqualTo("anna")
        assertThat(roster.single().displayName).isEqualTo("Anna K")
        assertThat(roster.single().avatarURL).isEqualTo("a.png")
    }

    @Test
    fun `the display name falls back to the first and last names, then to the handle`() {
        val roster = MentionContactRoster.fromFriends(
            friends = listOf(
                FriendRequestUser(id = "u1", username = "anna", firstName = "Anna", lastName = "Kis", displayName = " "),
                FriendRequestUser(id = "u2", username = "bob"),
            ),
            blocked = emptySet(),
        )
        assertThat(roster.map { it.displayName }).containsExactly("Anna Kis", "bob").inOrder()
    }

    @Test
    fun `a friend without a handle, a blocked friend and a repeated friend are dropped`() {
        val roster = MentionContactRoster.fromFriends(
            friends = listOf(
                FriendRequestUser(id = "u1", username = ""),
                FriendRequestUser(id = "u2", username = "blocked"),
                FriendRequestUser(id = "u3", username = "carol"),
                FriendRequestUser(id = "u3", username = "carol"),
            ),
            blocked = setOf("u2"),
        )
        assertThat(roster.map { it.username }).containsExactly("carol")
    }
}
