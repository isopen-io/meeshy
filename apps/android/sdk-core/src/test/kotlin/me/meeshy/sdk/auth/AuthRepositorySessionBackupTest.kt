package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.net.BackedUpSession
import me.meeshy.sdk.net.BackedUpTokenStore
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.SessionBackup
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/**
 * Réinstaller l'app garde la connexion (#14058) : la session d'un compte vit aussi dans le
 * Block Store, relue au premier lancement sans session, renouvelée auprès de la passerelle,
 * effacée à la déconnexion et quand la passerelle la refuse.
 */
class AuthRepositorySessionBackupTest {

    private class FakeBackup(var held: BackedUpSession? = null, private val unavailable: Boolean = false) : SessionBackup {
        var reads = 0
        var erasures = 0

        override suspend fun read(): BackedUpSession? {
            reads += 1
            return if (unavailable) null else held
        }

        override fun save(session: BackedUpSession) {
            held = session
        }

        override fun erase() {
            erasures += 1
            held = null
        }
    }

    private class NoTeardown : SessionTeardown {
        override suspend fun wipe() = Unit
    }

    private class Scenario(
        val repository: AuthRepository,
        val api: AuthApi,
        val store: TokenStore,
        val session: SessionRepository,
        val backup: FakeBackup,
    )

    private val saved = BackedUpSession(userId = "u1", jwt = "old-jwt", sessionToken = "sess-1")
    private val user = MeeshyUser(id = "u1", username = "atabeth")

    private fun scenario(
        backup: FakeBackup = FakeBackup(held = saved),
        inner: TokenStore = InMemoryTokenStore(),
        accounts: SavedAccountsStore = InMemorySavedAccountsStore(),
        configure: AuthApi.() -> Unit = {},
    ): Scenario {
        val api = mockk<AuthApi>(relaxed = true).apply(configure)
        val consent = KeepSignedInConsent(accounts)
        val store = BackedUpTokenStore(inner, backup, consent)
        val session = SessionRepository(api, store)
        val repository = AuthRepository(
            api, store, session, NoTeardown(), SyncSeqTracker(), sessionBackup = backup, keepSignedIn = consent,
        )
        return Scenario(repository, api, store, session, backup)
    }

    private fun refused(status: Int): HttpException =
        HttpException(Response.error<Any>(status, """{"success":false,"error":"Session révoquée","code":"SESSION_REVOKED"}""".toResponseBody()))

    @Test
    fun `la connexion ecrit la session dans la sauvegarde`() = runTest {
        val s = scenario(backup = FakeBackup()) {
            coEvery { login(any()) } returns ApiResponse(
                success = true,
                data = me.meeshy.sdk.model.auth.LoginResponse(user = user, token = "jwt-1", sessionToken = "sess-1"),
            )
        }

        s.repository.loginOutcome("atabeth", "secret", rememberDevice = true)

        assertThat(s.backup.held).isEqualTo(BackedUpSession(userId = "u1", jwt = "jwt-1", sessionToken = "sess-1"))
    }

    @Test
    fun `au premier lancement sans session la sauvegarde est renouvelee et la session ouverte`() = runTest {
        val s = scenario {
            coEvery { refresh(any()) } returns ApiResponse(
                success = true,
                data = AuthSession(user = user, token = "new-jwt", sessionToken = "sess-1"),
            )
        }

        val restored = s.repository.restoreBackedUpSession()

        assertThat(restored?.id).isEqualTo("u1")
        coVerify { s.api.refresh(RefreshTokenRequest(token = "old-jwt", sessionToken = "sess-1")) }
        assertThat(s.store.jwt).isEqualTo("new-jwt")
        assertThat(s.store.sessionToken).isEqualTo("sess-1")
        assertThat(s.store.userId).isEqualTo("u1")
        assertThat(s.session.currentUserId).isEqualTo("u1")
        assertThat(s.session.sessionOrigin.value).isEqualTo(SessionOrigin.RESTORED)
        assertThat(s.backup.held?.jwt).isEqualTo("new-jwt")
    }

    @Test
    fun `la passerelle qui ne rend pas de jeton de session garde celui de la sauvegarde`() = runTest {
        val s = scenario {
            coEvery { refresh(any()) } returns ApiResponse(success = true, data = AuthSession(user = user, token = "new-jwt"))
        }

        s.repository.restoreBackedUpSession()

        assertThat(s.store.sessionToken).isEqualTo("sess-1")
    }

    @Test
    fun `un jeton refuse efface la sauvegarde et laisse l'ecran de connexion`() = runTest {
        val s = scenario { coEvery { refresh(any()) } throws refused(401) }

        val restored = s.repository.restoreBackedUpSession()

        assertThat(restored).isNull()
        assertThat(s.backup.held).isNull()
        assertThat(s.store.isAuthenticated).isFalse()
        assertThat(s.session.currentUserId).isNull()
    }

    @Test
    fun `un refus d'activation ou d'age efface aussi la sauvegarde`() = runTest {
        val s = scenario { coEvery { refresh(any()) } throws refused(403) }

        s.repository.restoreBackedUpSession()

        assertThat(s.backup.held).isNull()
    }

    @Test
    fun `hors ligne la sauvegarde est gardee pour le prochain lancement`() = runTest {
        val s = scenario { coEvery { refresh(any()) } throws IOException("offline") }

        val restored = s.repository.restoreBackedUpSession()

        assertThat(restored).isNull()
        assertThat(s.backup.held).isEqualTo(saved)
        assertThat(s.store.isAuthenticated).isFalse()
    }

    @Test
    fun `une panne de la passerelle garde la sauvegarde`() = runTest {
        val s = scenario { coEvery { refresh(any()) } throws refused(503) }

        s.repository.restoreBackedUpSession()

        assertThat(s.backup.held).isEqualTo(saved)
    }

    @Test
    fun `un block store indisponible laisse l'ecran de connexion sans appel`() = runTest {
        val s = scenario(backup = FakeBackup(held = saved, unavailable = true))

        val restored = s.repository.restoreBackedUpSession()

        assertThat(restored).isNull()
        assertThat(s.store.isAuthenticated).isFalse()
        coVerify(exactly = 0) { s.api.refresh(any()) }
    }

    @Test
    fun `une session locale presente ne lit pas la sauvegarde`() = runTest {
        val backup = FakeBackup(held = saved)
        val s = scenario(backup = backup, inner = InMemoryTokenStore(jwt = "local", sessionToken = "s", userId = "u1"))

        val restored = s.repository.restoreBackedUpSession()

        assertThat(restored).isNull()
        assertThat(backup.reads).isEqualTo(0)
        coVerify(exactly = 0) { s.api.refresh(any()) }
    }

    @Test
    fun `une connexion faite pendant le renouvellement n'est pas ecrasee`() = runTest {
        lateinit var s: Scenario
        s = scenario {
            coEvery { refresh(any()) } coAnswers {
                s.store.jwt = "typed-jwt"
                s.store.sessionToken = "typed-sess"
                ApiResponse(success = true, data = AuthSession(user = user, token = "new-jwt", sessionToken = "sess-1"))
            }
        }

        val restored = s.repository.restoreBackedUpSession()

        assertThat(restored).isNull()
        assertThat(s.store.jwt).isEqualTo("typed-jwt")
    }

    @Test
    fun `la deconnexion efface la sauvegarde`() = runTest {
        val s = scenario {
            coEvery { refresh(any()) } returns ApiResponse(
                success = true,
                data = AuthSession(user = user, token = "new-jwt", sessionToken = "sess-1"),
            )
        }
        s.repository.restoreBackedUpSession()

        s.repository.logout()

        assertThat(s.backup.held).isNull()
        assertThat(s.store.isAuthenticated).isFalse()
    }

    private fun loginAnswering(api: AuthApi) {
        coEvery { api.login(any()) } returns ApiResponse(
            success = true,
            data = me.meeshy.sdk.model.auth.LoginResponse(user = user, token = "jwt-1", sessionToken = "sess-1"),
        )
    }

    @Test
    fun `rester connecte decoche n'ecrit rien et efface l'entree existante`() = runTest {
        val s = scenario(backup = FakeBackup(held = saved)) { loginAnswering(this) }

        s.repository.loginOutcome("atabeth", "secret", rememberDevice = false)

        assertThat(s.backup.held).isNull()
        assertThat(s.store.jwt).isEqualTo("jwt-1")
    }

    @Test
    fun `rester connecte coche ecrit la session`() = runTest {
        val s = scenario(backup = FakeBackup()) { loginAnswering(this) }

        s.repository.loginOutcome("atabeth", "secret", rememberDevice = true)

        assertThat(s.backup.held?.jwt).isEqualTo("jwt-1")
    }

    @Test
    fun `au redemarrage un compte qui ne reste pas connecte n'est pas sauvegarde`() = runTest {
        val accounts = InMemorySavedAccountsStore(
            listOf(SavedAccount(id = "u1", username = "atabeth", displayName = null, avatarUrl = null, lastActiveAtMillis = 1L, keepsSession = false)),
        )
        val s = scenario(
            backup = FakeBackup(),
            inner = InMemoryTokenStore(jwt = "jwt-1", sessionToken = "sess-1"),
            accounts = accounts,
        ) {
            coEvery { me() } returns ApiResponse(success = true, data = me.meeshy.sdk.model.MeEnvelope(user))
        }

        s.repository.restoreSession()

        assertThat(s.store.userId).isEqualTo("u1")
        assertThat(s.backup.held).isNull()
    }
}
