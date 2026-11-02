package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.UserActivation
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.AuthApi
import org.junit.Test

/**
 * [SessionRepository.adoptMerging]: the server answer to a profile mutation is merged — voicePublic,
 * the decor and the activation the route does not serve survive — and an edit still waiting in the
 * outbox is re-applied on top instead of being erased by an older confirmation.
 */
class SessionRepositoryMergeTest {

    private val decor = ServedProfileDecor(banner = ServedProfileDecorItem(pack = "p", item = "i"))
    private val activation = UserActivation(phase = UserActivation.Phase.QUIET, deadline = null)

    private fun local() = MeeshyUser(
        id = "u1",
        username = "alice",
        displayName = "Alice",
        voicePublic = true,
        profileDecor = decor,
        activation = activation,
    )

    private fun repo(pending: PendingProfileEdits = PendingProfileEdits.NONE) =
        SessionRepository(mockk<AuthApi>(relaxed = true), InMemoryTokenStore(), SessionTransitionFlags(), pending)

    @Test
    fun `adoptMerging keeps voicePublic, the decor and the activation`() = runTest {
        val repo = repo()
        repo.adopt(local())

        repo.adoptMerging(MeeshyUser(id = "u1", username = "alice", displayName = "Alicia"))

        val user = repo.currentUser.value!!
        assertThat(user.displayName).isEqualTo("Alicia")
        assertThat(user.voicePublic).isTrue()
        assertThat(user.profileDecor).isEqualTo(decor)
        assertThat(user.activation).isEqualTo(activation)
    }

    @Test
    fun `adoptMerging re-applies a newer pending edit but not the delivered one`() = runTest {
        var excluded: String? = "unset"
        val repo = repo { _, excluding ->
            excluded = excluding
            listOf(UpdateProfileRequest(bio = "newer"))
        }
        repo.adopt(local())

        repo.adoptMerging(MeeshyUser(id = "u1", username = "alice", bio = "server"), deliveredCmid = "cmid_1")

        assertThat(repo.currentUser.value?.bio).isEqualTo("newer")
        assertThat(excluded).isEqualTo("cmid_1")
    }

    @Test
    fun `adoptMerging ignores an answer for another account or a closed session`() = runTest {
        val repo = repo()
        repo.adopt(local())

        repo.adoptMerging(MeeshyUser(id = "u2", username = "bob"))
        assertThat(repo.currentUserId).isEqualTo("u1")

        repo.clear()
        repo.adoptMerging(MeeshyUser(id = "u1", username = "alice"))
        assertThat(repo.currentUser.value).isNull()
    }
}
