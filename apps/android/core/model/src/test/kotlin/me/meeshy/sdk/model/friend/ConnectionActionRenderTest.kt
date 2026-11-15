package me.meeshy.sdk.model.friend

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConnectionActionRenderTest {

    @Test
    fun `self renders nothing`() {
        assertThat(ConnectionActionRender.from(UserRelationshipState.Current))
            .isEqualTo(ConnectionActionRender.Hidden)
    }

    @Test
    fun `blocked renders the red badge`() {
        assertThat(ConnectionActionRender.from(UserRelationshipState.Blocked))
            .isEqualTo(ConnectionActionRender.BlockedBadge)
    }

    @Test
    fun `a contact renders the green badge`() {
        assertThat(ConnectionActionRender.from(UserRelationshipState.Connected))
            .isEqualTo(ConnectionActionRender.ContactBadge)
    }

    @Test
    fun `a received request renders accept and decline carrying the request id`() {
        assertThat(ConnectionActionRender.from(UserRelationshipState.PendingReceived("r1")))
            .isEqualTo(ConnectionActionRender.AcceptDecline("r1"))
    }

    @Test
    fun `a sent request renders the cancellable pending capsule`() {
        assertThat(ConnectionActionRender.from(UserRelationshipState.PendingSent("r2")))
            .isEqualTo(ConnectionActionRender.PendingSent)
    }

    @Test
    fun `no relation renders the add capsule`() {
        assertThat(ConnectionActionRender.from(UserRelationshipState.None))
            .isEqualTo(ConnectionActionRender.Add)
    }

    @Test
    fun `the discover connect actions map onto the same six renderings`() {
        assertThat(ConnectionActionRender.from(ConnectAction.Hidden)).isEqualTo(ConnectionActionRender.Hidden)
        assertThat(ConnectionActionRender.from(ConnectAction.Blocked)).isEqualTo(ConnectionActionRender.BlockedBadge)
        assertThat(ConnectionActionRender.from(ConnectAction.Contact)).isEqualTo(ConnectionActionRender.ContactBadge)
        assertThat(ConnectionActionRender.from(ConnectAction.Accept("r3")))
            .isEqualTo(ConnectionActionRender.AcceptDecline("r3"))
        assertThat(ConnectionActionRender.from(ConnectAction.Pending)).isEqualTo(ConnectionActionRender.PendingSent)
        assertThat(ConnectionActionRender.from(ConnectAction.Connect)).isEqualTo(ConnectionActionRender.Add)
    }

    @Test
    fun `only gesture-bearing renderings are interactive`() {
        assertThat(ConnectionActionRender.Hidden.isInteractive).isFalse()
        assertThat(ConnectionActionRender.BlockedBadge.isInteractive).isFalse()
        assertThat(ConnectionActionRender.ContactBadge.isInteractive).isFalse()
        assertThat(ConnectionActionRender.Add.isInteractive).isTrue()
        assertThat(ConnectionActionRender.PendingSent.isInteractive).isTrue()
        assertThat(ConnectionActionRender.AcceptDecline("r").isInteractive).isTrue()
    }

    @Test
    fun `failures carry the error haptic and successes do not`() {
        ConnectionFeedback.entries.filter { it.isError }
            .forEach { assertThat(it.haptic).isEqualTo(ConnectionHaptic.Error) }
        assertThat(ConnectionFeedback.RequestSent.haptic).isEqualTo(ConnectionHaptic.Success)
        assertThat(ConnectionFeedback.RequestDeclined.haptic).isEqualTo(ConnectionHaptic.Medium)
    }
}
