package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BlockedUserTest {

    @Test
    fun `resolvedName prefers a present display name`() {
        val user = BlockedUser(id = "u1", username = "handle", displayName = "Alice Cooper")
        assertThat(user.resolvedName).isEqualTo("Alice Cooper")
    }

    @Test
    fun `resolvedName falls back to the username when display name is null`() {
        val user = BlockedUser(id = "u1", username = "handle", displayName = null)
        assertThat(user.resolvedName).isEqualTo("handle")
    }

    @Test
    fun `resolvedName falls back to the username when display name is blank`() {
        val user = BlockedUser(id = "u1", username = "handle", displayName = "   ")
        assertThat(user.resolvedName).isEqualTo("handle")
    }

    @Test
    fun `resolvedName is empty only when both display name and username are empty`() {
        val user = BlockedUser(id = "u1", username = "", displayName = null)
        assertThat(user.resolvedName).isEmpty()
    }
}
