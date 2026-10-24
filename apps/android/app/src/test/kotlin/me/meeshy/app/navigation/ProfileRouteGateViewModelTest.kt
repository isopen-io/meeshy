package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * Migre de l'ancien `ProfileViewModelSelfTest` : ouvrir `profile/{monId}` ou
 * `profile/{monPseudo}` (notification, lien profond) mene a MA page ; un tiers reste un tiers.
 */
class ProfileRouteGateViewModelTest {

    private fun gate(user: MeeshyUser?): ProfileRouteGateViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(user)
        every { session.currentUserId } returns user?.id
        return ProfileRouteGateViewModel(session)
    }

    private fun me() = MeeshyUser(id = "me1", username = "atabeth", displayName = "Moi")

    @Test
    fun `opening my own id is my own page`() {
        assertThat(gate(me()).resolvesToSelf("me1")).isTrue()
    }

    @Test
    fun `opening my own username is my own page`() {
        assertThat(gate(me()).resolvesToSelf("atabeth")).isTrue()
    }

    @Test
    fun `opening someone else stays a third party page`() {
        assertThat(gate(me()).resolvesToSelf("u2")).isFalse()
    }

    @Test
    fun `without a session nothing resolves to self`() {
        assertThat(gate(null).resolvesToSelf("me1")).isFalse()
    }
}
