package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.EmailProvenSession
import me.meeshy.sdk.model.auth.ProvenOpenResult
import me.meeshy.sdk.model.auth.ProvenRefusal
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.net.SessionTransitionFlags
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProvenSessionOpenerTest {

    private class FakePort(
        override var isAuthenticated: Boolean = false,
        override var activeUserId: String? = null,
        var closeSucceedsAfter: Int = 1,
    ) : ProvenSessionPort {
        val installed = mutableListOf<Pair<AuthSession, SessionOrigin>>()
        val closedJwts = mutableListOf<String>()
        private var closeCalls = 0

        override fun install(session: AuthSession, origin: SessionOrigin) {
            installed += session to origin
        }

        override suspend fun closeServerSession(jwt: String, sessionToken: String?): Boolean {
            closeCalls += 1
            if (closeCalls < closeSucceedsAfter) return false
            closedJwts += jwt
            return true
        }
    }

    private class Scenario(
        val scope: TestScope,
        val port: FakePort,
        val flags: SessionTransitionFlags,
        val opener: ProvenSessionOpener,
    )

    private fun TestScope.scenario(port: FakePort = FakePort(), flags: SessionTransitionFlags = SessionTransitionFlags()) =
        Scenario(this, port, flags, ProvenSessionOpener(port, flags, this) { currentTime })

    private fun proven(
        userId: String = "u1",
        jwt: String = "jwt-$userId",
        receivedAt: Long = 0,
        window: Long = 240_000,
        origin: SessionOrigin = SessionOrigin.LOGIN,
    ) = EmailProvenSession(
        session = AuthSession(MeeshyUser(id = userId, username = userId), token = jwt, sessionToken = "s-$userId"),
        origin = origin,
        receivedAtMs = receivedAt,
        adoptableForMs = window,
    )

    @Test
    fun `installe la session hors changement de compte avec son origine`() = runTest {
        val s = scenario()

        val result = s.opener.open(proven(origin = SessionOrigin.REGISTRATION))
        advanceUntilIdle()

        assertThat(result).isEqualTo(ProvenOpenResult.Opened)
        assertThat(s.port.installed.single().second).isEqualTo(SessionOrigin.REGISTRATION)
        assertThat(s.port.closedJwts).isEmpty()
    }

    @Test
    fun `refuse pendant un changement de compte et ferme la session cote serveur`() = runTest {
        val s = scenario(flags = SessionTransitionFlags().also { it.isSwitchingAccount = true })

        val result = s.opener.open(proven())
        advanceUntilIdle()

        assertThat(result).isEqualTo(ProvenOpenResult.Refused(ProvenRefusal.AccountSwitchUnderway))
        assertThat(s.port.installed).isEmpty()
        assertThat(s.port.closedJwts).containsExactly("jwt-u1")
    }

    @Test
    fun `n'ecrase jamais un autre compte ouvert et ferme la session refusee`() = runTest {
        val s = scenario(FakePort(isAuthenticated = true, activeUserId = "other"))

        val result = s.opener.open(proven())
        advanceUntilIdle()

        assertThat(result).isEqualTo(ProvenOpenResult.Refused(ProvenRefusal.SessionReplacementRefused("other", "u1")))
        assertThat(s.port.installed).isEmpty()
        assertThat(s.port.closedJwts).containsExactly("jwt-u1")
    }

    @Test
    fun `une preuve du compte deja ouvert s'installe`() = runTest {
        val s = scenario(FakePort(isAuthenticated = true, activeUserId = "u1"))

        assertThat(s.opener.open(proven())).isEqualTo(ProvenOpenResult.Opened)
    }

    @Test
    fun `une preuve hors fenetre est ecartee et fermee`() = runTest {
        val s = scenario()
        advanceTimeBy(300_000)

        val result = s.opener.open(proven(receivedAt = 0, window = 240_000))
        advanceUntilIdle()

        assertThat(result).isEqualTo(ProvenOpenResult.Refused(ProvenRefusal.WindowLapsed))
        assertThat(s.port.installed).isEmpty()
        assertThat(s.port.closedJwts).containsExactly("jwt-u1")
    }

    @Test
    fun `discard ferme la session et reessaie si la passerelle ne repond pas`() = runTest {
        val s = scenario(FakePort(closeSucceedsAfter = 3))

        s.opener.discard(proven())

        assertThat(s.port.closedJwts).containsExactly("jwt-u1")
        assertThat(s.port.installed).isEmpty()
    }

    @Test
    fun `la session tenue s'installe a la saisie du code`() = runTest {
        val s = scenario()
        s.opener.hold(proven(origin = SessionOrigin.REGISTRATION))

        assertThat(s.port.installed).isEmpty()
        assertThat(s.opener.hasHeldSession).isTrue()
        assertThat(s.opener.installHeld()).isEqualTo(ProvenOpenResult.Opened)
        assertThat(s.opener.hasHeldSession).isFalse()
        assertThat(s.port.installed).hasSize(1)
        s.scope.advanceUntilIdle()
        assertThat(s.port.closedJwts).isEmpty()
    }

    @Test
    fun `rien a installer quand rien n'est tenu`() = runTest {
        assertThat(scenario().opener.installHeld()).isNull()
    }

    @Test
    fun `la session tenue abandonnee est fermee cote serveur`() = runTest {
        val s = scenario()
        s.opener.hold(proven())

        s.opener.discardHeld()
        advanceUntilIdle()

        assertThat(s.port.closedJwts).containsExactly("jwt-u1")
        assertThat(s.opener.hasHeldSession).isFalse()
    }

    @Test
    fun `tenir une seconde session ecarte la premiere`() = runTest {
        val s = scenario()
        s.opener.hold(proven("u1"))
        s.opener.hold(proven("u2"))
        advanceUntilIdle()

        assertThat(s.port.closedJwts).containsExactly("jwt-u1")
        assertThat(s.opener.installHeld()).isEqualTo(ProvenOpenResult.Opened)
        assertThat(s.port.installed.single().first.user.id).isEqualTo("u2")
    }

    @Test
    fun `la session tenue expire avec sa fenetre plus le delai de grace`() = runTest {
        val s = scenario()
        s.opener.hold(proven(receivedAt = 0, window = 10_000))

        advanceTimeBy(10_000 + ProvenSessionOpener.HOLD_GRACE_MS - 1)
        assertThat(s.opener.hasHeldSession).isTrue()

        advanceTimeBy(2)
        advanceUntilIdle()
        assertThat(s.opener.hasHeldSession).isFalse()
        assertThat(s.port.closedJwts).containsExactly("jwt-u1")
        assertThat(s.port.installed).isEmpty()
    }
}
