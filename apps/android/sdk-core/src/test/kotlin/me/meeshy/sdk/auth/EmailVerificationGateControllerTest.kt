package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.EmailGateReason
import me.meeshy.sdk.net.EmailVerificationGateRegistry
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EmailVerificationGateControllerTest {

    private val user = MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "u1", username = "alice", email = "a@mail.com"))
    private val registry = EmailVerificationGateRegistry()

    private fun controller(): EmailVerificationGateController {
        val sessions = mockk<SessionRepository>()
        every { sessions.currentUser } returns user
        return EmailVerificationGateController(sessions, registry)
    }

    @Test
    fun `le gardien se pose dans le registre que lit le reseau`() {
        val controller = controller()

        assertThat(registry.current).isSameInstanceAs(controller)
    }

    @Test
    fun `une demande presente la validation avec l'adresse du compte puis rend le verdict`() = runTest(StandardTestDispatcher()) {
        val controller = controller()
        var verdict: Boolean? = null

        val job = launch { verdict = controller.verifyEmail(EmailGateReason.PUBLISH) }
        advanceUntilIdle()
        assertThat(controller.request.value).isEqualTo(EmailGateRequest(EmailGateReason.PUBLISH, "a@mail.com"))
        assertThat(verdict).isNull()

        controller.settle(true)
        job.join()

        assertThat(verdict).isTrue()
        assertThat(controller.request.value).isNull()
    }

    @Test
    fun `toutes les demandes partagent une presentation et un verdict`() = runTest(StandardTestDispatcher()) {
        val controller = controller()
        val verdicts = mutableListOf<Boolean>()

        val first = launch { verdicts += controller.verifyEmail(EmailGateReason.PUBLISH) }
        val second = launch { verdicts += controller.verifyEmail(EmailGateReason.LINK) }
        advanceUntilIdle()
        assertThat(controller.request.value?.reason).isEqualTo(EmailGateReason.PUBLISH)

        controller.settle(false)
        first.join()
        second.join()

        assertThat(verdicts).containsExactly(false, false)
    }

    @Test
    fun `une adresse prouvee ne se redemande pas pour ce compte`() = runTest(StandardTestDispatcher()) {
        val controller = controller()
        assertThat(controller.emailKnownUnproven()).isTrue()

        val job = launch { controller.verifyEmail(EmailGateReason.INVITE) }
        advanceUntilIdle()
        controller.settle(true)
        job.join()

        assertThat(controller.emailKnownUnproven()).isFalse()
    }

    @Test
    fun `sans adresse rien ne se presente`() = runTest(StandardTestDispatcher()) {
        user.value = MeeshyUser(id = "u1", username = "alice", email = null)
        val controller = controller()

        assertThat(controller.verifyEmail(EmailGateReason.PUBLISH)).isFalse()
        assertThat(controller.request.value).isNull()
    }

    @Test
    fun `la derniere demande abandonnee referme la feuille`() = runTest(StandardTestDispatcher()) {
        val controller = controller()

        val job = launch { controller.verifyEmail(EmailGateReason.PUBLISH) }
        advanceUntilIdle()
        assertThat(controller.request.value).isNotNull()
        job.cancel()
        advanceUntilIdle()

        assertThat(controller.request.value).isNull()
    }

    @Test
    fun `une validation tranchee apres un changement de compte ne rejoue pas l'action de l'ancien compte`() = runTest(StandardTestDispatcher()) {
        val controller = controller()
        var verdict: Boolean? = null

        val job = launch { verdict = controller.verifyEmail(EmailGateReason.PUBLISH) }
        advanceUntilIdle()
        user.value = MeeshyUser(id = "u2", username = "bob", email = "b@mail.com")
        controller.settle(true)
        job.join()

        assertThat(verdict).isFalse()
        assertThat(controller.request.value).isNull()
        assertThat(controller.emailKnownUnproven()).isTrue()
    }

    @Test
    fun `un verdict sans demande est sans effet`() = runTest(StandardTestDispatcher()) {
        val controller = controller()

        controller.settle(true)

        assertThat(controller.emailKnownUnproven()).isTrue()
    }
}
