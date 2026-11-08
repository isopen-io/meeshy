package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileGuardTest {
    private val server = MeeshyUser(id = "u1", username = "alice", displayName = "Alice", bio = "server bio")

    @Test
    fun `no pending edit gives the server profile`() {
        assertThat(ProfileGuard.fold(server, emptyList())).isEqualTo(server)
    }

    @Test
    fun `pending edits are replayed oldest first so the latest wins`() {
        val out = ProfileGuard.fold(
            server,
            listOf(UpdateProfileRequest(bio = "first"), UpdateProfileRequest(bio = "second", displayName = "Ally")),
        )
        assertThat(out.bio).isEqualTo("second")
        assertThat(out.displayName).isEqualTo("Ally")
    }
}
