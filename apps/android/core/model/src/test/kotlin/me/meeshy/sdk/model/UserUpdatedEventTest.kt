package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import org.junit.Test

class UserUpdatedEventTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun decode(raw: String) = json.decodeFromString<UserUpdatedEvent>(raw)

    @Test
    fun `composedName prefers displayName then full name then username`() {
        val base = UserUpdatedEvent(userId = "u", username = "bob", hasNameGroup = true)
        assertThat(base.copy(displayName = "Bobby", firstName = "Bob").composedName).isEqualTo("Bobby")
        assertThat(base.copy(firstName = "Bob", lastName = " Marley ").composedName).isEqualTo("Bob Marley")
        assertThat(base.copy(displayName = "  ").composedName).isEqualTo("bob")
    }

    @Test
    fun `composedName is null outside the name group`() {
        assertThat(UserUpdatedEvent(userId = "u", displayName = "x").composedName).isNull()
    }

    @Test
    fun `username marks the name group and absent keys are not nulls`() {
        val e = decode("""{"userId":"u1","changes":{"username":"bob","displayName":null}}""")
        assertThat(e.hasNameGroup).isTrue()
        assertThat(e.displayName).isNull()
        assertThat(e.avatar).isEqualTo(OptionalMediaChange.Unchanged)
        assertThat(decode("""{"userId":"u1","changes":{"avatar":"a.png"}}""").hasNameGroup).isFalse()
    }

    @Test
    fun `avatar is tri-state`() {
        assertThat(decode("""{"userId":"u","changes":{}}""").avatar).isEqualTo(OptionalMediaChange.Unchanged)
        assertThat(decode("""{"userId":"u","changes":{"avatar":null}}""").avatar).isEqualTo(OptionalMediaChange.Replaced(null))
        assertThat(decode("""{"userId":"u","changes":{"avatar":"n.png"}}""").avatar).isEqualTo(OptionalMediaChange.Replaced("n.png"))
        assertThat(OptionalMediaChange.Replaced(null).applied("old")).isNull()
        assertThat(OptionalMediaChange.Unchanged.applied("old")).isEqualTo("old")
    }
}
