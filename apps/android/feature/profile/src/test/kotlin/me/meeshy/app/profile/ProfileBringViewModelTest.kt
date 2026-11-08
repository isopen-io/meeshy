package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.sdk.model.relation.BringSent
import me.meeshy.sdk.model.relation.RelationPersonSettings
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.relation.BringGateway
import me.meeshy.sdk.relation.BringSendOutcome
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La ligne du Bring d'une fiche (#16617) — iso `ProfileBringViewModelTests.swift`. */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileBringViewModelTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }

    @After fun tearDown() { Dispatchers.resetMain() }

    private class FakeGateway(
        var served: BringAvailability? = BringAvailability("u2", available = true, perDay = 3, remainingToday = 3),
        var outcome: BringSendOutcome = BringSendOutcome.Failed,
    ) : BringGateway {
        val ringing = MutableStateFlow<Map<String, BringSent>>(emptyMap())
        var sends = 0
        val cancelled = mutableListOf<String>()
        override val outgoing: StateFlow<Map<String, BringSent>> = ringing
        override suspend fun availability(userId: String) = served
        override suspend fun send(userId: String): BringSendOutcome {
            sends++
            (outcome as? BringSendOutcome.Sent)?.let { sent -> ringing.update { it + (userId to sent.sent) } }
            return outcome
        }
        override fun cancel(toUserId: String) {
            cancelled += toUserId
            ringing.update { it - toUserId }
        }
        override suspend fun personSettings(userId: String): RelationPersonSettings? = null
        override suspend fun setReceptionBlocked(
            userId: String,
            setting: RelationReceptionSetting,
            blocked: Boolean,
        ): RelationPersonSettings? = null
    }

    private val sent = BringSent("b1", "u2", "2026-11-07T10:00:00Z", "2026-11-07T10:02:00Z", perDay = 3, remainingToday = 2)

    private fun loaded(gateway: FakeGateway) = ProfileBringViewModel(gateway).also { it.load("u2") }

    @Test
    fun `la ligne n'existe que si la passerelle l'ouvre`() {
        assertThat(loaded(FakeGateway()).state.value.isOffered).isTrue()
        assertThat(loaded(FakeGateway(served = BringAvailability("u2", available = false, remainingToday = 0))).state.value.isOffered)
            .isFalse()
        assertThat(loaded(FakeGateway(served = null)).state.value.isOffered).isFalse()
    }

    @Test
    fun `un envoi reussi sonne chez l'autre et recompte sans relire`() {
        val gateway = FakeGateway(outcome = BringSendOutcome.Sent(sent))
        val viewModel = loaded(gateway)

        viewModel.send()

        assertThat(viewModel.state.value.ringing).isEqualTo(sent)
        assertThat(viewModel.state.value.availability?.remainingToday).isEqualTo(2)
        assertThat(viewModel.state.value.isSending).isFalse()
    }

    @Test
    fun `un refus 403 retire la ligne sans rien dire`() {
        val viewModel = loaded(FakeGateway(outcome = BringSendOutcome.Gone))

        viewModel.send()

        assertThat(viewModel.state.value.isOffered).isFalse()
        assertThat(viewModel.state.value.notice).isNull()
    }

    @Test
    fun `le quota atteint epuise la ligne et le dit`() {
        val viewModel = loaded(FakeGateway(outcome = BringSendOutcome.Quota))

        viewModel.send()

        assertThat(viewModel.state.value.availability?.isExhausted).isTrue()
        assertThat(viewModel.state.value.notice).isEqualTo(BringNotice.QUOTA)
    }

    @Test
    fun `hors ligne et en panne la ligne reste, et le refus se dit`() {
        val offline = loaded(FakeGateway(outcome = BringSendOutcome.Offline)).apply { send() }
        assertThat(offline.state.value.notice).isEqualTo(BringNotice.OFFLINE)
        assertThat(offline.state.value.isOffered).isTrue()

        val failed = loaded(FakeGateway(outcome = BringSendOutcome.Failed)).apply { send() }
        assertThat(failed.state.value.notice).isEqualTo(BringNotice.FAILED)
        failed.consumeNotice()
        assertThat(failed.state.value.notice).isNull()
    }

    @Test
    fun `une ligne epuisee n'envoie rien`() {
        val gateway = FakeGateway(served = BringAvailability("u2", available = true, perDay = 3, remainingToday = 0))
        loaded(gateway).send()
        assertThat(gateway.sends).isEqualTo(0)
    }

    @Test
    fun `annuler fait cesser la sonnerie chez cette personne`() {
        val gateway = FakeGateway(outcome = BringSendOutcome.Sent(sent))
        val viewModel = loaded(gateway)
        viewModel.send()

        viewModel.cancel()

        assertThat(gateway.cancelled).containsExactly("u2")
        assertThat(viewModel.state.value.ringing).isNull()
    }

    @Test
    fun `l'arret servi ailleurs fait disparaitre ca sonne`() {
        val gateway = FakeGateway(outcome = BringSendOutcome.Sent(sent))
        val viewModel = loaded(gateway)
        viewModel.send()

        gateway.ringing.value = emptyMap()

        assertThat(viewModel.state.value.ringing).isNull()
    }
}
