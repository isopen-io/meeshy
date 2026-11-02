package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le renouvellement des identifiants TURN d'un long appel (#13773), miroir de iOS `CallTurnCredentials`,
 * `CallReliabilityPolicy.turnRefreshDelay` / `turnRefreshShouldRetry` et `TurnCredentialRefreshPolicy`.
 */
class CallTurnCredentialsLawTest {

    private val relay = SocketIceServer(urls = listOf("turn:relay"), username = "u", credential = "p")

    @Test
    fun `the refresh falls at 80 percent of the served lifetime`() {
        assertThat(CallTurnCredentialsLaw.refreshDelayMs(3_600)).isEqualTo(2_880_000L)
        assertThat(CallTurnCredentialsLaw.refreshDelayMs(86_400)).isEqualTo(69_120_000L)
    }

    @Test
    fun `an unknown lifetime takes the gateway default, a degenerate one the floor`() {
        assertThat(CallTurnCredentialsLaw.refreshDelayMs(null)).isEqualTo(69_120_000L)
        assertThat(CallTurnCredentialsLaw.refreshDelayMs(0)).isEqualTo(30_000L)
        assertThat(CallTurnCredentialsLaw.refreshDelayMs(-5)).isEqualTo(30_000L)
        assertThat(CallTurnCredentialsLaw.refreshDelayMs(30)).isEqualTo(30_000L)
    }

    @Test
    fun `a configured set arms the deadline, an empty one asks at once`() {
        assertThat(CallTurnCredentialsLaw.afterConfigure(listOf(relay), ttlSeconds = 600))
            .isEqualTo(TurnCredentialsStart.Schedule(480_000L))
        assertThat(CallTurnCredentialsLaw.afterConfigure(listOf(relay)))
            .isEqualTo(TurnCredentialsStart.Schedule(69_120_000L))
        assertThat(CallTurnCredentialsLaw.afterConfigure(emptyList(), ttlSeconds = 600))
            .isEqualTo(TurnCredentialsStart.RequestNow)
    }

    @Test
    fun `an unanswered request retries three times, then gives way to the next cycle`() {
        assertThat((0..4).map(CallTurnCredentialsLaw::shouldRetry)).containsExactly(true, true, true, false, false).inOrder()
    }

    @Test
    fun `fresh credentials restart ICE on a live call, rearm a reconnection, and leave the rest alone`() {
        assertThat(CallTurnCredentialsLaw.iceAction(CallState.Connected)).isEqualTo(TurnRefreshIceAction.RestartIce)
        assertThat(CallTurnCredentialsLaw.iceAction(CallState.Reconnecting(2))).isEqualTo(TurnRefreshIceAction.RearmReconnect)
        listOf(
            CallState.Idle, CallState.Ringing(isOutgoing = true), CallState.Ringing(isOutgoing = false),
            CallState.Offering, CallState.Connecting, CallState.Ended(CallEndReason.Local),
        ).forEach { assertThat(CallTurnCredentialsLaw.iceAction(it)).isEqualTo(TurnRefreshIceAction.Inert) }
    }

    @Test
    fun `each new reconnection attempt asks for fresh credentials, a repeated one does not`() {
        val law = CallTurnCredentialsLaw::requestsFreshOn
        assertThat(law(CallState.Connected, CallState.Reconnecting(1))).isTrue()
        assertThat(law(CallState.Reconnecting(1), CallState.Reconnecting(2))).isTrue()
        assertThat(law(CallState.Reconnecting(2), CallState.Reconnecting(2))).isFalse()
        assertThat(law(CallState.Reconnecting(2), CallState.Connected)).isFalse()
        assertThat(law(CallState.Connecting, CallState.Connected)).isFalse()
        assertThat(law(CallState.Reconnecting(3), CallState.Ended(CallEndReason.ConnectionLost))).isFalse()
    }
}
