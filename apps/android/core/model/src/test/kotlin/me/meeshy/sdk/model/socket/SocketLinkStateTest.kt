package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocketLinkStateTest {

    @Test
    fun `la premiere connexion n'est pas une reconnexion`() {
        val established = SocketLinkState().opened().connected()
        assertThat(established.wasReconnect).isFalse()
        assertThat(established.state.link).isEqualTo(SocketLink.Connected)
        assertThat(established.state.hadPreviousConnection).isTrue()
    }

    @Test
    fun `la connexion qui suit une perte est une reconnexion`() {
        val lost = SocketLinkState().opened().connected().state.transportLost()
        assertThat(lost.link).isEqualTo(SocketLink.Reconnecting(0))
        assertThat(lost.connected().wasReconnect).isTrue()
    }

    @Test
    fun `avant toute connexion une perte reste une ouverture`() {
        assertThat(SocketLinkState().opened().transportLost().link).isEqualTo(SocketLink.Connecting)
    }

    @Test
    fun `l'echelle de l'app porte le numero de tentative`() {
        val state = SocketLinkState().opened().connected().state.reconnecting(3)
        assertThat(state.link).isEqualTo(SocketLink.Reconnecting(3))
        assertThat(state.isConnected).isFalse()
    }

    @Test
    fun `la suspension garde l'historique et la fermeture l'efface`() {
        val live = SocketLinkState().opened().connected().state
        val suspended = live.suspended()
        assertThat(suspended.link).isEqualTo(SocketLink.Disconnected)
        assertThat(suspended.opened().link).isEqualTo(SocketLink.Reconnecting(0))
        assertThat(suspended.opened().connected().wasReconnect).isTrue()
        assertThat(live.closed()).isEqualTo(SocketLinkState())
    }
}
