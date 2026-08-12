package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure telecom-connection policy: every [CallState]
 * maps to the right connection state, every [CallEndReason] to the right
 * disconnect cause, and every lifecycle edge emits (or withholds) the right
 * report — including the dedupe, phantom-disconnect and settle guards.
 */
class TelecomCallPolicyTest {

    // --- connectionStateFor: the connection state per phase --------------------

    @Test
    fun `idle has no telecom connection`() {
        assertThat(TelecomCallPolicy.connectionStateFor(CallState.Idle)).isNull()
    }

    @Test
    fun `an outgoing ring is dialing`() {
        assertThat(TelecomCallPolicy.connectionStateFor(CallState.Ringing(isOutgoing = true)))
            .isEqualTo(TelecomConnectionState.Dialing)
    }

    @Test
    fun `an incoming ring is ringing`() {
        assertThat(TelecomCallPolicy.connectionStateFor(CallState.Ringing(isOutgoing = false)))
            .isEqualTo(TelecomConnectionState.Ringing)
    }

    @Test
    fun `offering is still dialing while awaiting the answer`() {
        assertThat(TelecomCallPolicy.connectionStateFor(CallState.Offering))
            .isEqualTo(TelecomConnectionState.Dialing)
    }

    @Test
    fun `connecting is active - the call is answered`() {
        assertThat(TelecomCallPolicy.connectionStateFor(CallState.Connecting))
            .isEqualTo(TelecomConnectionState.Active)
    }

    @Test
    fun `connected is active`() {
        assertThat(TelecomCallPolicy.connectionStateFor(CallState.Connected))
            .isEqualTo(TelecomConnectionState.Active)
    }

    @Test
    fun `reconnecting stays active - an ICE restart never tears the call down`() {
        assertThat(TelecomCallPolicy.connectionStateFor(CallState.Reconnecting(attempt = 2)))
            .isEqualTo(TelecomConnectionState.Active)
    }

    @Test
    fun `ended is disconnected`() {
        assertThat(TelecomCallPolicy.connectionStateFor(CallState.Ended(CallEndReason.Local)))
            .isEqualTo(TelecomConnectionState.Disconnected)
    }

    // --- disconnectCauseFor: the cause per end reason --------------------------

    @Test
    fun `a local hang-up disconnects locally`() {
        assertThat(TelecomCallPolicy.disconnectCauseFor(CallEndReason.Local))
            .isEqualTo(TelecomDisconnectCause.Local)
    }

    @Test
    fun `a remote hang-up disconnects remotely`() {
        assertThat(TelecomCallPolicy.disconnectCauseFor(CallEndReason.Remote))
            .isEqualTo(TelecomDisconnectCause.Remote)
    }

    @Test
    fun `a rejected call disconnects as rejected`() {
        assertThat(TelecomCallPolicy.disconnectCauseFor(CallEndReason.Rejected))
            .isEqualTo(TelecomDisconnectCause.Rejected)
    }

    @Test
    fun `a missed call disconnects as missed`() {
        assertThat(TelecomCallPolicy.disconnectCauseFor(CallEndReason.Missed))
            .isEqualTo(TelecomDisconnectCause.Missed)
    }

    @Test
    fun `a lost connection disconnects as an error`() {
        assertThat(TelecomCallPolicy.disconnectCauseFor(CallEndReason.ConnectionLost))
            .isEqualTo(TelecomDisconnectCause.Error)
    }

    @Test
    fun `a failed call disconnects as an error`() {
        assertThat(TelecomCallPolicy.disconnectCauseFor(CallEndReason.Failed("ice gathering failed")))
            .isEqualTo(TelecomDisconnectCause.Error)
    }

    // --- plan: the report per edge --------------------------------------------

    @Test
    fun `placing an outgoing call registers a dialing connection`() {
        assertThat(TelecomCallPolicy.plan(CallState.Idle, CallState.Ringing(isOutgoing = true)))
            .isEqualTo(TelecomConnectionUpdate(TelecomConnectionState.Dialing))
    }

    @Test
    fun `receiving an incoming call registers a ringing connection`() {
        assertThat(TelecomCallPolicy.plan(CallState.Idle, CallState.Ringing(isOutgoing = false)))
            .isEqualTo(TelecomConnectionUpdate(TelecomConnectionState.Ringing))
    }

    @Test
    fun `the answer lands making the connection active`() {
        assertThat(TelecomCallPolicy.plan(CallState.Offering, CallState.Connecting))
            .isEqualTo(TelecomConnectionUpdate(TelecomConnectionState.Active))
    }

    @Test
    fun `an incoming call answered goes active`() {
        assertThat(TelecomCallPolicy.plan(CallState.Ringing(isOutgoing = false), CallState.Connecting))
            .isEqualTo(TelecomConnectionUpdate(TelecomConnectionState.Active))
    }

    @Test
    fun `connecting to connected emits no report - already active`() {
        assertThat(TelecomCallPolicy.plan(CallState.Connecting, CallState.Connected)).isNull()
    }

    @Test
    fun `connected to reconnecting emits no report - stays active`() {
        assertThat(TelecomCallPolicy.plan(CallState.Connected, CallState.Reconnecting(attempt = 1)))
            .isNull()
    }

    @Test
    fun `reconnecting back to connected emits no report - stays active`() {
        assertThat(TelecomCallPolicy.plan(CallState.Reconnecting(attempt = 1), CallState.Connected))
            .isNull()
    }

    @Test
    fun `hanging up a live call disconnects locally`() {
        assertThat(TelecomCallPolicy.plan(CallState.Connected, CallState.Ended(CallEndReason.Local)))
            .isEqualTo(
                TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Local),
            )
    }

    @Test
    fun `declining an incoming ring disconnects as rejected`() {
        assertThat(
            TelecomCallPolicy.plan(
                CallState.Ringing(isOutgoing = false),
                CallState.Ended(CallEndReason.Rejected),
            ),
        ).isEqualTo(
            TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Rejected),
        )
    }

    @Test
    fun `a dialing call that fails to initiate disconnects as an error`() {
        assertThat(
            TelecomCallPolicy.plan(
                CallState.Ringing(isOutgoing = true),
                CallState.Ended(CallEndReason.Failed("call:initiate timed out")),
            ),
        ).isEqualTo(
            TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Error),
        )
    }

    @Test
    fun `a reconnect budget exhausted disconnects as an error`() {
        assertThat(
            TelecomCallPolicy.plan(
                CallState.Reconnecting(attempt = 3),
                CallState.Ended(CallEndReason.ConnectionLost),
            ),
        ).isEqualTo(
            TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Error),
        )
    }

    @Test
    fun `a phantom idle to ended emits no report - no connection was ever created`() {
        assertThat(TelecomCallPolicy.plan(CallState.Idle, CallState.Ended(CallEndReason.Missed)))
            .isNull()
    }

    @Test
    fun `an idempotent ended to ended emits no report`() {
        assertThat(
            TelecomCallPolicy.plan(
                CallState.Ended(CallEndReason.Local),
                CallState.Ended(CallEndReason.Local),
            ),
        ).isNull()
    }

    @Test
    fun `settling a terminal call back to idle emits no report`() {
        assertThat(TelecomCallPolicy.plan(CallState.Ended(CallEndReason.Local), CallState.Idle))
            .isNull()
    }
}
