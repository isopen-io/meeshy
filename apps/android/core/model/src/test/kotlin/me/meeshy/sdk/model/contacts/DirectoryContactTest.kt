package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class DirectoryContactTest {

    private fun user(display: String? = null, first: String? = null, last: String? = null) =
        MatchedContactUser(id = "u1", username = "alice", firstName = first, lastName = last, displayName = display)

    private fun contact(
        name: String? = null,
        user: MatchedContactUser? = null,
        phones: List<String> = emptyList(),
        emails: List<String> = emptyList(),
    ) = DirectoryContact(
        id = "d1", contactKey = "k", displayName = name, phoneNumbers = phones, emails = emails,
        isOnMeeshy = user != null, matchedUser = user,
    )

    @Test fun `address book name comes first`() {
        assertThat(contact("Maman", user("Alice A")).resolvedName).isEqualTo("Maman")
    }

    @Test fun `then the account display name, composed name, handle`() {
        assertThat(contact(null, user(display = "Alice A")).resolvedName).isEqualTo("Alice A")
        assertThat(contact(null, user(first = "Al", last = "Ice")).resolvedName).isEqualTo("Al Ice")
        assertThat(contact(null, user()).resolvedName).isEqualTo("@alice")
    }

    @Test fun `then the first identifier`() {
        assertThat(contact(phones = listOf("+33612")).resolvedName).isEqualTo("+33612")
        assertThat(contact(emails = listOf("a@b.c")).resolvedName).isEqualTo("a@b.c")
        assertThat(contact().resolvedName).isEqualTo("")
    }

    @Test fun `subtitle is the handle or the first phone or email`() {
        assertThat(contact(user = user()).subtitle).isEqualTo("@alice")
        assertThat(contact(phones = listOf("+1")).subtitle).isEqualTo("+1")
        assertThat(contact(emails = listOf("a@b.c")).subtitle).isEqualTo("a@b.c")
    }

    @Test fun `invitable number is the first phone`() {
        assertThat(contact(phones = listOf("+1", "+2")).invitablePhoneNumber).isEqualTo("+1")
        assertThat(contact().invitablePhoneNumber).isNull()
    }

    @Test fun `match view needs an account and defaults matchedBy to phone`() {
        assertThat(contact().asContactMatch).isNull()
        val m = contact("Maman", user()).asContactMatch!!
        assertThat(m.matchedBy).isEqualTo("phone")
        assertThat(m.contactDisplayName).isEqualTo("Maman")
        assertThat(m.id).isEqualTo("u1")
    }

    @Test fun `sync body carries no mode and always the three arrays`() {
        val wire = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
        val body = wire.encodeToString(
            DirectorySyncRequest.serializer(),
            DirectorySyncRequest(listOf(ContactMatchEntry(displayName = "x")), "FR", DirectorySyncMode.Merge),
        )
        val obj = wire.parseToJsonElement(body).jsonObject
        assertThat(obj.keys).doesNotContain("mode")
        assertThat(obj.keys).doesNotContain("syncStartedAt")
        val entry = (obj["contacts"] as kotlinx.serialization.json.JsonArray)[0].jsonObject
        assertThat(entry.keys).containsAtLeast("phoneNumbers", "emails", "usernames")
    }
}
