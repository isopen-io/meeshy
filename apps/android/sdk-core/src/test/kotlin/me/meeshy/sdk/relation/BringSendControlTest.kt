package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.sdk.model.relation.BringSent
import me.meeshy.sdk.model.relation.RelationPersonSettings
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import org.junit.Test

/**
 * Ce que la fiche ET l'en-tête d'un direct partagent pour envoyer un Bring (#17442) : une seule machine, deux surfaces.
 * Le regard de l'en-tête ([BringLook]) se lit sur le même état que la ligne de la fiche.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BringSendControlTest {

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

    private val sent = BringSent("b1", "u2", "2026-11-10T10:00:00Z", "2026-11-10T10:02:00Z", perDay = 3, remainingToday = 2)

    private fun loaded(gateway: FakeGateway) =
        BringSendControl(gateway, CoroutineScope(UnconfinedTestDispatcher())).also { it.load("u2") }

    @Test
    fun `sans ouverture de la passerelle, l'en-tete ne montre rien`() {
        assertThat(BringSendState().look).isEqualTo(BringLook.HIDDEN)
        val closed = loaded(FakeGateway(served = BringAvailability("u2", available = false, remainingToday = 0)))
        assertThat(closed.state.value.look).isEqualTo(BringLook.HIDDEN)
        assertThat(loaded(FakeGateway(served = null)).state.value.look).isEqualTo(BringLook.HIDDEN)
    }

    @Test
    fun `ouvert, l'en-tete propose de faire sonner`() {
        assertThat(loaded(FakeGateway()).state.value.look).isEqualTo(BringLook.SEND)
    }

    @Test
    fun `un envoi reussi sonne chez l'autre, et l'en-tete propose d'arreter`() {
        val control = loaded(FakeGateway(outcome = BringSendOutcome.Sent(sent)))

        control.send()

        assertThat(control.state.value.ringing).isEqualTo(sent)
        assertThat(control.state.value.availability?.remainingToday).isEqualTo(2)
        assertThat(control.state.value.look).isEqualTo(BringLook.RINGING)
    }

    @Test
    fun `annuler depuis l'en-tete arrete la sonnerie chez cette personne`() {
        val gateway = FakeGateway(outcome = BringSendOutcome.Sent(sent))
        val control = loaded(gateway)
        control.send()

        control.cancel()

        assertThat(gateway.cancelled).containsExactly("u2")
        assertThat(control.state.value.look).isEqualTo(BringLook.SEND)
    }

    @Test
    fun `un Bring envoye depuis la fiche sonne aussi dans l'en-tete`() {
        val gateway = FakeGateway()
        val header = loaded(gateway)

        gateway.ringing.value = mapOf("u2" to sent)

        assertThat(header.state.value.look).isEqualTo(BringLook.RINGING)
    }

    @Test
    fun `le quota atteint garde le bouton, qui dit le quota, et n'envoie plus rien`() {
        val gateway = FakeGateway(outcome = BringSendOutcome.Quota)
        val control = loaded(gateway)

        control.send()
        control.send()

        assertThat(control.state.value.look).isEqualTo(BringLook.EXHAUSTED)
        assertThat(control.state.value.notice).isEqualTo(BringNotice.QUOTA)
        assertThat(gateway.sends).isEqualTo(1)
    }

    @Test
    fun `un refus 403 retire le bouton sans rien dire`() {
        val control = loaded(FakeGateway(outcome = BringSendOutcome.Gone))

        control.send()

        assertThat(control.state.value.look).isEqualTo(BringLook.HIDDEN)
        assertThat(control.state.value.notice).isNull()
    }

    @Test
    fun `hors ligne, le bouton reste et le refus se dit, puis s'efface`() {
        val control = loaded(FakeGateway(outcome = BringSendOutcome.Offline))

        control.send()

        assertThat(control.state.value.look).isEqualTo(BringLook.SEND)
        assertThat(control.state.value.notice).isEqualTo(BringNotice.OFFLINE)
        control.consumeNotice()
        assertThat(control.state.value.notice).isNull()
    }
}
