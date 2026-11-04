package me.meeshy.sdk.session

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.auth.SessionRevocationReason
import me.meeshy.sdk.socket.SocketSessionRevocation
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRevocationCenterTest {
    private class Rig(var signedIn: Boolean = true) {
        val revocations = MutableSharedFlow<SocketSessionRevocation>(extraBufferCapacity = 8)
        val expirations = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        private var counter = 0
        private var clock = 1_000L
        val center = SessionRevocationCenter(
            revocations = revocations,
            expirations = expirations,
            isSignedIn = { signedIn },
            newId = { "n${++counter}" },
            now = { clock++ },
        )
    }

    private fun revoked(reason: String?) = SocketSessionRevocation(
        payload = if (reason == null) """{"code":"SESSION_REVOKED"}""" else """{"reason":"$reason"}""",
        accountJwt = null,
    )

    private fun TestScope.started(rig: Rig) = rig.center.start(backgroundScope + UnconfinedTestDispatcher(testScheduler))

    @Test
    fun `une fermeture par le serveur produit un avis avec son motif et un signal de fermeture`() = runTest {
        val rig = Rig()
        started(rig)
        rig.center.closures.test {
            rig.revocations.emit(revoked("admin_revoke"))
            val closed = awaitItem()
            assertThat(closed.reason).isEqualTo(SessionRevocationReason.ADMIN_REVOKE)
            assertThat(rig.center.notice.value).isEqualTo(closed)
        }
    }

    @Test
    fun `un motif inconnu ou absent ferme comme une deconnexion generique`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(revoked("quarantine_v9"))
        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.UNKNOWN)
        rig.center.acknowledge(rig.center.notice.value!!.id)
        rig.revocations.emit(revoked(null))
        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.UNKNOWN)
    }

    @Test
    fun `deux fermetures successives sont deux avis distincts`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(revoked("logout"))
        val first = rig.center.notice.value!!
        rig.center.acknowledge(first.id)
        assertThat(rig.center.notice.value).isNull()
        rig.revocations.emit(revoked("logout"))
        val second = rig.center.notice.value!!
        assertThat(second.id).isNotEqualTo(first.id)
        assertThat(second.receivedAtEpochMillis).isGreaterThan(first.receivedAtEpochMillis)
    }

    @Test
    fun `acquitter un ancien avis laisse l'avis courant`() = runTest {
        val rig = Rig()
        rig.center.report(SessionRevocationReason.LOGOUT)
        rig.center.acknowledge("autre")
        assertThat(rig.center.notice.value).isNotNull()
    }

    @Test
    fun `une expiration produit l'avis session expiree et une rafale n'en fait qu'un`() = runTest {
        val rig = Rig()
        started(rig)
        rig.center.closures.test {
            rig.expirations.emit(Unit)
            rig.expirations.emit(Unit)
            assertThat(awaitItem().reason).isEqualTo(SessionRevocationReason.SESSION_EXPIRED)
            expectNoEvents()
        }
    }

    @Test
    fun `sans session ouverte aucun avis n'est leve`() = runTest {
        val rig = Rig(signedIn = false)
        started(rig)
        rig.expirations.emit(Unit)
        rig.revocations.emit(revoked("logout"))
        assertThat(rig.center.notice.value).isNull()
    }

    @Test
    fun `un evenement portant deletedAccountId n'affiche rien`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(SocketSessionRevocation("""{"deletedAccountId":"507f1f77bcf86cd799439011","reason":"admin_revoke"}""", null))
        assertThat(rig.center.notice.value).isNull()
    }
}
