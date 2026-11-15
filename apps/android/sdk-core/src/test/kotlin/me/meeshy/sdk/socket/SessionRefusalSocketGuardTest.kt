package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.SessionRefusalNotifier
import org.junit.Test

class SessionRefusalSocketGuardTest {
    private fun jwtOf(userId: String): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        return "h.${enc.encodeToString("""{"exp":${NOW + 3_600},"userId":"$userId"}""".toByteArray())}.s"
    }

    private class Harness(jwt: String?, session: String? = "sess") {
        val rig = SocketRig(jwt = jwt, session = session)
        val notifier = SessionRefusalNotifier()
        var stops = 0
        val guard = SessionRefusalSocketGuard(notifier, rig.manager.serverErrors, rig.manager.sessionRevocations) { stops++ }
        val deleted = mutableListOf<String>()

        init {
            val scope = CoroutineScope(Dispatchers.Unconfined)
            guard.start(scope)
            scope.launch { notifier.accountDeleted.collect { deleted += it } }
            rig.manager.connect()
        }

        val socket get() = rig.factory.created.single()
    }

    @Test
    fun `l evenement error ACCOUNT_DELETED du compte de la connexion coupe la socket et signale le retrait`() = runTest {
        val h = Harness(jwtOf("u1"))
        h.socket.fire("error", """{"message":"x","code":"ACCOUNT_DELETED","accountId":"u1"}""")
        assertThat(h.stops).isEqualTo(1)
        assertThat(h.notifier.isAwaitingRetirement("u1")).isTrue()
        assertThat(h.deleted).containsExactly("u1")
    }

    @Test
    fun `un compte nomme qui n est pas celui de la connexion ne retire rien et ne coupe rien`() = runTest {
        val h = Harness(jwtOf("u1"))
        h.socket.fire("error", """{"code":"ACCOUNT_DELETED","accountId":"u2"}""")
        assertThat(h.stops).isEqualTo(0)
        assertThat(h.notifier.hasPendingRetirement).isFalse()
    }

    @Test
    fun `auth session-revoked avec deletedAccountId du proprietaire signale le retrait sans couper la socket`() = runTest {
        val h = Harness(jwtOf("u1"))
        h.socket.fire("auth:session-revoked", org.json.JSONObject("""{"reason":"account_deleted","deletedAccountId":"u1"}"""))
        assertThat(h.deleted).containsExactly("u1")
        assertThat(h.stops).isEqualTo(0)
    }

    @Test
    fun `auth session-revoked ordinaire ou d un autre compte ne retire rien`() = runTest {
        val h = Harness(jwtOf("u1"))
        h.socket.fire("auth:session-revoked", org.json.JSONObject("""{"reason":"password_changed"}"""))
        h.socket.fire("auth:session-revoked", org.json.JSONObject("""{"deletedAccountId":"u2"}"""))
        assertThat(h.notifier.hasPendingRetirement).isFalse()
    }

    @Test
    fun `la fin de session d un invite arrete les reconnexions`() = runTest {
        val h = Harness(jwt = null, session = "guest-A")
        h.socket.fire("error", """{"code":"SHARE_LINK_EXPIRED"}""")
        assertThat(h.stops).isEqualTo(1)
        assertThat(h.notifier.hasPendingRetirement).isFalse()
    }

    @Test
    fun `une erreur ordinaire ne coupe rien`() = runTest {
        val h = Harness(jwtOf("u1"))
        h.socket.fire("error", """{"code":"RATE_LIMIT"}""")
        assertThat(h.stops).isEqualTo(0)
    }
}
