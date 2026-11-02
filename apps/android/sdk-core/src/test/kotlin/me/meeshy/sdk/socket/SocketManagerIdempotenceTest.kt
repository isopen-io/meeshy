package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.socket.SocketConnectOutcome
import org.junit.Test

class SocketManagerIdempotenceTest {

    @Test
    fun `deux connect ne creent qu'une socket et un seul jeu d'ecouteurs`() {
        val rig = SocketRig()

        val first = rig.manager.connect()
        val second = rig.manager.connect()

        assertThat(first).isEqualTo(SocketConnectOutcome.ARMED)
        assertThat(second).isEqualTo(SocketConnectOutcome.ARMED)
        val socket = rig.factory.created.single()
        assertThat(socket.connectCalls).isEqualTo(1)
        assertThat(socket.count("connect")).isEqualTo(1)
        assertThat(socket.count("auth:token-expired")).isEqualTo(1)
    }

    @Test
    fun `disconnect ferme la socket, retire ses ecouteurs et revient a l'etat deconnecte`() {
        val rig = SocketRig()
        rig.manager.connect()
        val socket = rig.factory.created.single()

        rig.manager.disconnect()

        assertThat(socket.disconnectCalls).isEqualTo(1)
        assertThat(socket.removedAll).isTrue()
        assertThat(rig.manager.connectionState.value).isEqualTo(SocketConnectionState.DISCONNECTED)
    }

    @Test
    fun `reconnect apres disconnect ouvre une nouvelle socket`() {
        val rig = SocketRig()
        rig.manager.connect()
        rig.manager.disconnect()

        rig.manager.connect()

        assertThat(rig.factory.created).hasSize(2)
        assertThat(rig.factory.created[1].connectCalls).isEqualTo(1)
    }

    @Test
    fun `un ecouteur pose avant l'ouverture est rejoue sur la socket`() {
        val rig = SocketRig()
        var received = 0
        rig.manager.on("message:new") { received++ }

        rig.manager.connect()
        rig.factory.created.single().fire("message:new")

        assertThat(received).isEqualTo(1)
    }

    @Test
    fun `un ecouteur pose apres l'ouverture n'est pas double par un second connect`() {
        val rig = SocketRig()
        rig.manager.connect()
        rig.manager.on("message:new") { }

        rig.manager.connect()

        assertThat(rig.factory.created.single().count("message:new")).isEqualTo(1)
    }

    @Test
    fun `reconnectWithToken garde les ecouteurs enregistres`() {
        val rig = SocketRig()
        rig.manager.on("message:new") { }
        rig.manager.connect()

        rig.manager.reconnectWithToken()

        assertThat(rig.factory.created).hasSize(2)
        assertThat(rig.factory.created[1].count("message:new")).isEqualTo(1)
    }

    @Test
    fun `un JWT echu n'ouvre pas de socket, renouvelle puis se connecte avec le jeton frais`() {
        val fresh = jwtExpiringAt(NOW + 7_200)
        val rig = SocketRig(jwt = expiredJwt, session = "sess", renewTo = fresh)

        val outcome = rig.manager.connect()

        assertThat(outcome).isEqualTo(SocketConnectOutcome.NOT_ARMED)
        assertThat(rig.refreshCalls).containsExactly("sess")
        assertThat(rig.factory.created.single().auth["token"]).isEqualTo(fresh)
    }

    @Test
    fun `un renouvellement refuse n'ouvre aucune socket`() {
        val rig = SocketRig(jwt = expiredJwt, session = "sess", renewTo = null)

        rig.manager.connect()

        assertThat(rig.factory.created).isEmpty()
    }

    @Test
    fun `la socket suit l'etat connecte puis la reconnexion`() {
        val rig = SocketRig()
        rig.manager.connect()
        val socket = rig.factory.created.single()

        socket.fire("connect")
        assertThat(rig.manager.connectionState.value).isEqualTo(SocketConnectionState.CONNECTED)

        socket.fire("disconnect", "transport close")
        assertThat(rig.manager.connectionState.value).isEqualTo(SocketConnectionState.CONNECTING)
    }
}
