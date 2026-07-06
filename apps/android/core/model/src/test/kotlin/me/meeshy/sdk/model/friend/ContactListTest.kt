package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import org.junit.Test

class ContactListTest {

    private fun user(
        id: String,
        username: String = id,
        displayName: String? = null,
        firstName: String? = null,
        lastName: String? = null,
        isOnline: Boolean? = null,
        lastActiveAt: String? = null,
    ) = FriendRequestUser(
        id = id,
        username = username,
        firstName = firstName,
        lastName = lastName,
        displayName = displayName,
        isOnline = isOnline,
        lastActiveAt = lastActiveAt,
    )

    private fun request(
        id: String,
        status: String = "accepted",
        sender: FriendRequestUser? = null,
        receiver: FriendRequestUser? = null,
    ) = FriendRequest(id = id, status = status, sender = sender, receiver = receiver)

    // MARK: - resolvedName

    @Test
    fun `resolvedName prefers display name`() {
        assertThat(user("u", username = "jdoe", displayName = "John Doe", firstName = "J").resolvedName)
            .isEqualTo("John Doe")
    }

    @Test
    fun `resolvedName falls back to first and last name when no display name`() {
        assertThat(user("u", username = "jdoe", firstName = "John", lastName = "Doe").resolvedName)
            .isEqualTo("John Doe")
    }

    @Test
    fun `resolvedName falls back to username when no names present`() {
        assertThat(user("u", username = "jdoe").resolvedName).isEqualTo("jdoe")
    }

    @Test
    fun `resolvedName ignores a blank display name`() {
        assertThat(user("u", username = "jdoe", displayName = "   ", firstName = "John").resolvedName)
            .isEqualTo("John")
    }

    // MARK: - fromAcceptedRequests

    @Test
    fun `only accepted requests become friends`() {
        val friends = ContactList.fromAcceptedRequests(
            received = listOf(
                request("r1", status = "accepted", sender = user("alice")),
                request("r2", status = "pending", sender = user("bob")),
            ),
            sent = emptyList(),
            currentUserId = "me",
        )
        assertThat(friends.map { it.id }).containsExactly("alice")
    }

    @Test
    fun `received request takes the sender, sent request takes the receiver`() {
        val friends = ContactList.fromAcceptedRequests(
            received = listOf(request("r1", sender = user("alice"), receiver = user("me"))),
            sent = listOf(request("s1", sender = user("me"), receiver = user("bob"))),
            currentUserId = "me",
        )
        assertThat(friends.map { it.id }).containsExactly("alice", "bob")
    }

    @Test
    fun `the current user is never listed as their own friend`() {
        val friends = ContactList.fromAcceptedRequests(
            received = listOf(request("r1", sender = user("me"), receiver = user("alice"))),
            sent = emptyList(),
            currentUserId = "me",
        )
        assertThat(friends.map { it.id }).containsExactly("alice")
    }

    @Test
    fun `a friend appearing in both received and sent is deduplicated`() {
        val friends = ContactList.fromAcceptedRequests(
            received = listOf(request("r1", sender = user("alice", isOnline = true))),
            sent = listOf(request("s1", receiver = user("alice", isOnline = false))),
            currentUserId = "me",
        )
        assertThat(friends.map { it.id }).containsExactly("alice")
        assertThat(friends.single().isOnline).isTrue()
    }

    @Test
    fun `a request with no valid counterparty is skipped`() {
        val friends = ContactList.fromAcceptedRequests(
            received = listOf(request("r1", sender = user("me"), receiver = null)),
            sent = emptyList(),
            currentUserId = "me",
        )
        assertThat(friends).isEmpty()
    }

    @Test
    fun `online friends sort before offline friends`() {
        val friends = ContactList.fromAcceptedRequests(
            received = listOf(
                request("r1", sender = user("offline1", isOnline = false)),
                request("r2", sender = user("online1", isOnline = true)),
            ),
            sent = emptyList(),
            currentUserId = "me",
        )
        assertThat(friends.map { it.id }).containsExactly("online1", "offline1").inOrder()
    }

    @Test
    fun `within the same presence, most recently active sorts first`() {
        val friends = ContactList.fromAcceptedRequests(
            received = listOf(
                request("r1", sender = user("older", isOnline = false, lastActiveAt = "2026-01-01T00:00:00Z")),
                request("r2", sender = user("newer", isOnline = false, lastActiveAt = "2026-06-01T00:00:00Z")),
            ),
            sent = emptyList(),
            currentUserId = "me",
        )
        assertThat(friends.map { it.id }).containsExactly("newer", "older").inOrder()
    }

    @Test
    fun `a null last-active date sorts after a dated one`() {
        val friends = ContactList.fromAcceptedRequests(
            received = listOf(
                request("r1", sender = user("undated", isOnline = false, lastActiveAt = null)),
                request("r2", sender = user("dated", isOnline = false, lastActiveAt = "2026-01-01T00:00:00Z")),
            ),
            sent = emptyList(),
            currentUserId = "me",
        )
        assertThat(friends.map { it.id }).containsExactly("dated", "undated").inOrder()
    }

    // MARK: - visible (filter + search)

    private val roster = listOf(
        user("alice", username = "alice", displayName = "Alice A", isOnline = true),
        user("bob", username = "bobby", displayName = "Bob B", isOnline = false),
        user("carol", username = "carol", displayName = "Carol C", isOnline = null),
    )

    @Test
    fun `All filter with a blank query returns everyone`() {
        assertThat(ContactList.visible(roster, ContactFilter.All, "").map { it.id })
            .containsExactly("alice", "bob", "carol").inOrder()
    }

    @Test
    fun `Online filter keeps only online friends`() {
        assertThat(ContactList.visible(roster, ContactFilter.Online, "").map { it.id })
            .containsExactly("alice")
    }

    @Test
    fun `Offline filter keeps everyone not online, including unknown presence`() {
        assertThat(ContactList.visible(roster, ContactFilter.Offline, "").map { it.id })
            .containsExactly("bob", "carol").inOrder()
    }

    @Test
    fun `Phonebook and Affiliates filters pass the list through unchanged`() {
        assertThat(ContactList.visible(roster, ContactFilter.Phonebook, "").map { it.id })
            .containsExactly("alice", "bob", "carol").inOrder()
        assertThat(ContactList.visible(roster, ContactFilter.Affiliates, "").map { it.id })
            .containsExactly("alice", "bob", "carol").inOrder()
    }

    @Test
    fun `search matches the username case-insensitively`() {
        assertThat(ContactList.visible(roster, ContactFilter.All, "BOB").map { it.id })
            .containsExactly("bob")
    }

    @Test
    fun `search matches the resolved name`() {
        assertThat(ContactList.visible(roster, ContactFilter.All, "carol c").map { it.id })
            .containsExactly("carol")
    }

    @Test
    fun `search is trimmed before matching`() {
        assertThat(ContactList.visible(roster, ContactFilter.All, "  alice  ").map { it.id })
            .containsExactly("alice")
    }

    @Test
    fun `search combines with the filter`() {
        assertThat(ContactList.visible(roster, ContactFilter.Online, "bob")).isEmpty()
    }

    @Test
    fun `search with no match returns empty`() {
        assertThat(ContactList.visible(roster, ContactFilter.All, "zzz")).isEmpty()
    }

    // MARK: - reconcile

    @Test
    fun `reconcile drops friends the cache no longer lists`() {
        val current = listOf(user("alice"), user("bob"))
        val result = ContactList.reconcile(current, cacheFriendIds = setOf("alice"))
        assertThat(result.friends.map { it.id }).containsExactly("alice")
        assertThat(result.needsRefetch).isFalse()
    }

    @Test
    fun `reconcile flags a refetch when the cache knows an unlisted friend`() {
        val current = listOf(user("alice"))
        val result = ContactList.reconcile(current, cacheFriendIds = setOf("alice", "bob"))
        assertThat(result.friends.map { it.id }).containsExactly("alice")
        assertThat(result.needsRefetch).isTrue()
    }

    @Test
    fun `reconcile is inert when the list already matches the cache`() {
        val current = listOf(user("alice"), user("bob"))
        val result = ContactList.reconcile(current, cacheFriendIds = setOf("alice", "bob"))
        assertThat(result.friends).isEqualTo(current)
        assertThat(result.needsRefetch).isFalse()
    }

    @Test
    fun `reconcile against an empty cache clears the list without a refetch`() {
        val result = ContactList.reconcile(listOf(user("alice")), cacheFriendIds = emptySet())
        assertThat(result.friends).isEmpty()
        assertThat(result.needsRefetch).isFalse()
    }
}
