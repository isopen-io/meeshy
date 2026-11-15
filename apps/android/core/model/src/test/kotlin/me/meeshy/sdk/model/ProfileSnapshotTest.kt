package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The server answer about MY profile is MERGED (voicePublic, decor and activation survive a route
 * that does not serve them) and a re-read never erases an edit still waiting in the outbox.
 */
class ProfileSnapshotTest {

    private val decor = ServedProfileDecor(banner = ServedProfileDecorItem(pack = "p", item = "i"))
    private val activation = UserActivation(phase = UserActivation.Phase.QUIET, deadline = null)

    private fun local() = MeeshyUser(
        id = "u1",
        username = "alice",
        displayName = "Alice",
        bio = "local bio",
        voicePublic = true,
        profileDecor = decor,
        activation = activation,
    )

    @Test
    fun `fields the route does not serve survive the merge`() {
        val server = MeeshyUser(id = "u1", username = "alice", displayName = "Alicia")

        val merged = ProfileSnapshot.mergingServerUser(server, local())

        assertThat(merged.displayName).isEqualTo("Alicia")
        assertThat(merged.voicePublic).isTrue()
        assertThat(merged.profileDecor).isEqualTo(decor)
        assertThat(merged.activation).isEqualTo(activation)
    }

    @Test
    fun `the server wins when it does serve those fields`() {
        val server = MeeshyUser(id = "u1", username = "alice", voicePublic = false, profileDecor = ServedProfileDecor.EMPTY)

        val merged = ProfileSnapshot.mergingServerUser(server, local())

        assertThat(merged.voicePublic).isFalse()
        assertThat(merged.profileDecor).isEqualTo(ServedProfileDecor.EMPTY)
    }

    @Test
    fun `a server answer for another account is taken verbatim`() {
        val server = MeeshyUser(id = "u2", username = "bob")

        assertThat(ProfileSnapshot.mergingServerUser(server, local())).isEqualTo(server)
        assertThat(ProfileSnapshot.mergingServerUser(server, null)).isEqualTo(server)
    }

    @Test
    fun `an older server state does not replace a more recent optimistic edit`() {
        val server = MeeshyUser(id = "u1", username = "alice", displayName = "Alice", bio = "old bio")

        val resolved = ProfileSnapshot.resolveServerUserWithOptimistic(
            server,
            listOf(UpdateProfileRequest(bio = ""), UpdateProfileRequest(displayName = "Alicia")),
        )

        assertThat(resolved.bio).isNull()
        assertThat(resolved.displayName).isEqualTo("Alicia")
    }

    @Test
    fun `with nothing pending the server state is confirmed as is`() {
        val server = MeeshyUser(id = "u1", username = "alice", displayName = "Server")

        assertThat(ProfileSnapshot.resolveServerUserWithOptimistic(server, emptyList())).isEqualTo(server)
    }
}
