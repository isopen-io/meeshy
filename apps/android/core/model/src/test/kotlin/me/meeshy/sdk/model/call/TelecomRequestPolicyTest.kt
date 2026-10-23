package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TelecomRequestPolicyTest {

    private val incoming = CallState.Ringing(isOutgoing = false)
    private val outgoing = CallState.Ringing(isOutgoing = true)

    private fun act(
        request: TelecomSystemRequest,
        state: CallState,
        muted: Boolean = false,
        byHold: Boolean = false,
    ) = TelecomRequestPolicy.actionFor(request, state, muted, byHold)

    @Test
    fun `decrocher depuis le systeme repond a un appel entrant qui sonne`() {
        assertThat(act(TelecomSystemRequest.Answer, incoming)).isEqualTo(TelecomRequestPolicy.Action.Answer)
    }

    @Test
    fun `decrocher est sans effet hors appel entrant qui sonne`() {
        assertThat(act(TelecomSystemRequest.Answer, outgoing)).isEqualTo(TelecomRequestPolicy.Action.None)
        assertThat(act(TelecomSystemRequest.Answer, CallState.Connected)).isEqualTo(TelecomRequestPolicy.Action.None)
        assertThat(act(TelecomSystemRequest.Answer, CallState.Idle)).isEqualTo(TelecomRequestPolicy.Action.None)
    }

    @Test
    fun `raccrocher pendant la sonnerie entrante refuse l appel`() {
        assertThat(act(TelecomSystemRequest.Disconnect, incoming)).isEqualTo(TelecomRequestPolicy.Action.Decline)
    }

    @Test
    fun `raccrocher un appel en cours termine l appel`() {
        listOf(outgoing, CallState.Offering, CallState.Connecting, CallState.Connected, CallState.Reconnecting(1))
            .forEach { assertThat(act(TelecomSystemRequest.Disconnect, it)).isEqualTo(TelecomRequestPolicy.Action.HangUp) }
    }

    @Test
    fun `raccrocher un appel deja termine ou inexistant ne fait rien`() {
        assertThat(act(TelecomSystemRequest.Disconnect, CallState.Idle)).isEqualTo(TelecomRequestPolicy.Action.None)
        assertThat(act(TelecomSystemRequest.Disconnect, CallState.Ended(CallEndReason.Local)))
            .isEqualTo(TelecomRequestPolicy.Action.None)
    }

    @Test
    fun `le micro suit le systeme seulement quand il differe`() {
        assertThat(act(TelecomSystemRequest.Mute(true), CallState.Connected, muted = false))
            .isEqualTo(TelecomRequestPolicy.Action.SetMuted(true, byHold = false))
        assertThat(act(TelecomSystemRequest.Mute(true), CallState.Connected, muted = true))
            .isEqualTo(TelecomRequestPolicy.Action.None)
    }

    @Test
    fun `la mise en attente coupe le micro puis la reprise le retablit`() {
        assertThat(act(TelecomSystemRequest.Hold(true), CallState.Connected))
            .isEqualTo(TelecomRequestPolicy.Action.SetMuted(true, byHold = true))
        assertThat(act(TelecomSystemRequest.Hold(false), CallState.Connected, muted = true, byHold = true))
            .isEqualTo(TelecomRequestPolicy.Action.SetMuted(false, byHold = false))
    }

    @Test
    fun `la reprise ne rouvre jamais un micro coupe par l utilisateur`() {
        assertThat(act(TelecomSystemRequest.Hold(true), CallState.Connected, muted = true))
            .isEqualTo(TelecomRequestPolicy.Action.None)
        assertThat(act(TelecomSystemRequest.Hold(false), CallState.Connected, muted = true, byHold = false))
            .isEqualTo(TelecomRequestPolicy.Action.None)
    }

    @Test
    fun `seul un raccroche de l utilisateur devient une demande de fin`() {
        assertThat(TelecomSystemDisconnectLaw.requestFor(TelecomSystemDisconnectKind.Local))
            .isEqualTo(TelecomSystemRequest.Disconnect)
        assertThat(TelecomSystemDisconnectLaw.requestFor(TelecomSystemDisconnectKind.Rejected))
            .isEqualTo(TelecomSystemRequest.Disconnect)
    }

    @Test
    fun `une destruction par le systeme n emet aucune demande de fin`() {
        TelecomSystemDisconnectKind.entries
            .filter { it != TelecomSystemDisconnectKind.Local && it != TelecomSystemDisconnectKind.Rejected }
            .forEach { assertThat(TelecomSystemDisconnectLaw.requestFor(it)).isNull() }
    }
}
