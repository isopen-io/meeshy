package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.auth.SessionRevocationReason
import me.meeshy.sdk.socket.SocketSessionRevocation
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRevocationCenterTest {
    private class Rig(
        var account: String? = ACCOUNT,
        val awaiting: Set<String> = emptySet(),
        val closeGate: CompletableDeferred<Unit>? = null,
    ) {
        val revocations = MutableSharedFlow<SocketSessionRevocation>(extraBufferCapacity = 8)
        val expirations = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        var closes = 0
        private var counter = 0
        private var clock = 1_000L
        val center = SessionRevocationCenter(
            revocations = revocations,
            expirations = expirations,
            activeAccount = { account },
            isAwaitingRetirement = { it in awaiting },
            closeSession = {
                closeGate?.await()
                closes++
                account = null
            },
            newId = { "n${++counter}" },
            now = { clock++ },
        )
    }

    private fun TestScope.started(rig: Rig) = rig.center.start(backgroundScope + UnconfinedTestDispatcher(testScheduler))

    @Test
    fun `une fermeture par le serveur ferme la session dans le singleton et leve un avis avec son motif`() = runTest {
        val rig = Rig()
        started(rig)

        rig.revocations.emit(revoked("admin_revoke"))

        assertThat(rig.closes).isEqualTo(1)
        val notice = rig.center.notice.value!!
        assertThat(notice.reason).isEqualTo(SessionRevocationReason.ADMIN_REVOKE)
        assertThat(rig.center.closed.value).isEqualTo(notice.id)
    }

    @Test
    fun `la fermeture ne depend d'aucun ecran, son etat se relit apres coup`() = runTest {
        val rig = Rig()
        started(rig)

        rig.expirations.emit(Unit)

        assertThat(rig.closes).isEqualTo(1)
        assertThat(rig.center.closed.value).isEqualTo(rig.center.notice.value?.id)
        assertThat(rig.center.closed.value).isNotNull()
    }

    @Test
    fun `un motif inconnu ou absent ferme comme une deconnexion generique`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(revoked("quarantine_v9"))
        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.UNKNOWN)
        rig.center.acknowledge(rig.center.notice.value!!.id)
        rig.account = ACCOUNT
        rig.revocations.emit(revoked(null))
        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.UNKNOWN)
        assertThat(rig.closes).isEqualTo(2)
    }

    @Test
    fun `deux fermetures successives sont deux avis distincts`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(revoked("logout"))
        val first = rig.center.notice.value!!
        rig.center.acknowledge(first.id)
        assertThat(rig.center.notice.value).isNull()
        rig.account = ACCOUNT
        rig.revocations.emit(revoked("logout"))
        val second = rig.center.notice.value!!
        assertThat(second.id).isNotEqualTo(first.id)
        assertThat(second.receivedAtEpochMillis).isGreaterThan(first.receivedAtEpochMillis)
    }

    @Test
    fun `une session rouverte pendant qu'un avis attend se ferme quand meme, et l'avis le plus recent l'emporte`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(revoked("logout"))
        val first = rig.center.notice.value!!
        rig.account = ACCOUNT

        rig.revocations.emit(revoked("password_changed"))

        assertThat(rig.closes).isEqualTo(2)
        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.PASSWORD_CHANGED)
        rig.center.acknowledge(first.id)
        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.PASSWORD_CHANGED)
    }

    @Test
    fun `acquitter un ancien avis laisse l'avis courant`() = runTest {
        val rig = Rig()
        rig.center.report(SessionRevocationReason.LOGOUT)
        rig.center.acknowledge("autre")
        assertThat(rig.center.notice.value).isNotNull()
    }

    @Test
    fun `une expiration produit l'avis session expiree et une rafale ne ferme qu'une fois`() = runTest {
        val rig = Rig()
        started(rig)
        rig.expirations.emit(Unit)
        rig.expirations.emit(Unit)
        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.SESSION_EXPIRED)
        assertThat(rig.closes).isEqualTo(1)
    }

    @Test
    fun `deux fermetures concurrentes depuis les deux sources ne ferment et n'avisent qu'une fois`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val rig = Rig(closeGate = gate)
        val first = launch { rig.center.report(SessionRevocationReason.SESSION_EXPIRED) }
        val second = launch { rig.center.onRevocation(revoked("logout")) }
        advanceUntilIdle()
        val pending = rig.center.notice.value
        gate.complete(Unit)
        first.join()
        second.join()

        assertThat(rig.closes).isEqualTo(1)
        assertThat(rig.center.notice.value).isEqualTo(pending)
        assertThat(rig.center.closed.value).isEqualTo(pending?.id)
    }

    @Test
    fun `des jetons deja vides n'empechent ni l'avis ni la fermeture tant que le compte est connu`() = runTest {
        // L'identité est la garde : le démontage par un renouvellement refusé vide les jetons AVANT l'annonce.
        val rig = Rig(account = ACCOUNT)
        started(rig)

        rig.expirations.emit(Unit)

        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.SESSION_EXPIRED)
        assertThat(rig.closes).isEqualTo(1)
    }

    @Test
    fun `sans aucun compte connu il n'y a rien a fermer ni a expliquer`() = runTest {
        val rig = Rig(account = null)
        started(rig)
        rig.expirations.emit(Unit)
        rig.revocations.emit(revoked("logout"))
        assertThat(rig.center.notice.value).isNull()
        assertThat(rig.closes).isEqualTo(0)
    }

    @Test
    fun `la purge confirmee du compte de la connexion n'affiche rien, le retrait la traite`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(SocketSessionRevocation("""{"deletedAccountId":"$ACCOUNT","reason":"admin_revoke"}""", jwtOf(ACCOUNT)))
        assertThat(rig.center.notice.value).isNull()
        assertThat(rig.closes).isEqualTo(0)
    }

    @Test
    fun `un deletedAccountId qui ne nomme pas le compte de la connexion n'empeche pas la fermeture`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(SocketSessionRevocation("""{"deletedAccountId":"$OTHER","reason":"admin_revoke"}""", jwtOf(ACCOUNT)))
        assertThat(rig.center.notice.value?.reason).isEqualTo(SessionRevocationReason.ADMIN_REVOKE)
        assertThat(rig.closes).isEqualTo(1)
    }

    @Test
    fun `la revocation d'une socket d'un autre compte ne ferme pas la session du compte actif`() = runTest {
        val rig = Rig()
        started(rig)
        rig.revocations.emit(SocketSessionRevocation("""{"reason":"logout"}""", jwtOf(OTHER)))
        rig.revocations.emit(SocketSessionRevocation("""{"reason":"logout"}""", null))
        assertThat(rig.center.notice.value).isNull()
        assertThat(rig.closes).isEqualTo(0)
    }

    @Test
    fun `un compte en attente de retrait n'est pas ferme ici`() = runTest {
        val rig = Rig(awaiting = setOf(ACCOUNT))
        started(rig)
        rig.expirations.emit(Unit)
        rig.revocations.emit(revoked("logout"))
        assertThat(rig.center.notice.value).isNull()
        assertThat(rig.closes).isEqualTo(0)
    }

    private companion object {
        const val ACCOUNT = "507f1f77bcf86cd799439011"
        const val OTHER = "507f1f77bcf86cd799439022"

        fun jwtOf(userId: String): String =
            "h." + Base64.getUrlEncoder().withoutPadding().encodeToString("""{"userId":"$userId"}""".toByteArray()) + ".s"

        fun revoked(reason: String?) = SocketSessionRevocation(
            payload = if (reason == null) """{"code":"SESSION_REVOKED"}""" else """{"reason":"$reason"}""",
            accountJwt = jwtOf(ACCOUNT),
        )
    }
}
