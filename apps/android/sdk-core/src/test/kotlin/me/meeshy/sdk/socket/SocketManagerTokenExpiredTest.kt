package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Test

class SocketManagerTokenExpiredTest {

    @Test
    fun `auth token-expired rafraichit au nom du jeton presente a CE handshake`() {
        val rig = SocketRig(jwt = validJwt, session = "sess")
        rig.manager.connect()
        val socket = rig.factory.created.single()
        // La session active a changé de jeton depuis : le socket parle toujours au nom du sien.
        rig.store.jwt = jwtExpiringAt(NOW + 9_000)

        socket.fire("auth:token-expired")

        assertThat(rig.manager.presentedToken).isEqualTo(validJwt)
        assertThat(rig.refreshCalls).isEmpty()
    }

    @Test
    fun `auth token-expired du jeton encore actif declenche le renouvellement`() {
        val rig = SocketRig(jwt = validJwt, session = "sess", renewTo = jwtExpiringAt(NOW + 9_000))
        rig.manager.connect()

        rig.factory.created.single().fire("auth:token-expired")

        assertThat(rig.refreshCalls).containsExactly("sess")
    }

    @Test
    fun `un invite n'a pas de jeton de compte a rafraichir`() {
        val rig = SocketRig(jwt = null, session = "anon")
        rig.manager.connect()

        rig.factory.created.single().fire("auth:token-expired")

        assertThat(rig.manager.presentedToken).isNull()
        assertThat(rig.refreshCalls).isEmpty()
    }

    @Test
    fun `auth session-revoked est expose avec son motif sans deconnecter`() = runTest {
        val rig = SocketRig()
        rig.manager.connect()
        val socket = rig.factory.created.single()

        rig.manager.sessionRevoked.test {
            socket.fire("auth:session-revoked", JSONObject().put("reason", "logout"))
            assertThat(awaitItem()).isEqualTo("logout")
        }
        assertThat(socket.disconnectCalls).isEqualTo(0)
    }

    @Test
    fun `l'evenement error est expose et ne deconnecte jamais`() = runTest {
        val rig = SocketRig()
        rig.manager.connect()
        val socket = rig.factory.created.single()

        rig.manager.socketErrors.test {
            socket.fire("error", "boom")
            assertThat(awaitItem()).isEqualTo("boom")
        }
        assertThat(socket.disconnectCalls).isEqualTo(0)
        assertThat(rig.manager.connectionState.value).isNotEqualTo(SocketConnectionState.DISCONNECTED)
    }
}
