package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.Test
import java.io.IOException

/**
 * La deconnexion : la purge locale d'abord et quoi qu'il arrive, puis `POST /auth/logout`
 * au mieux, avec les jetons FIGES de la session quittee.
 *
 * Les jetons sont releves AVANT la purge. Lus apres, ils seraient vides — ou ceux du
 * compte qui vient de se connecter, dont on fermerait la session a la place de l'autre.
 */
class AuthRepositoryLogoutTest {

    private class RecordingTeardown : SessionTeardown {
        var wipes = 0
            private set

        override suspend fun wipe() {
            wipes += 1
        }
    }

    private class Scenario(
        val repository: AuthRepository,
        val api: AuthApi,
        val store: TokenStore,
        val session: SessionRepository,
        val teardown: RecordingTeardown,
    )

    private fun scenario(
        store: TokenStore = InMemoryTokenStore(jwt = "jwt-a", sessionToken = "sess-a"),
        configure: AuthApi.() -> Unit = {},
    ): Scenario {
        val api = mockk<AuthApi>().apply(configure)
        val session = SessionRepository(api, store)
        val teardown = RecordingTeardown()
        return Scenario(AuthRepository(api, store, session, teardown, SyncSeqTracker()), api, store, session, teardown)
    }

    @Test
    fun `la passerelle recoit les jetons figes de la session quittee`() = runTest {
        val s = scenario { coEvery { logout(any(), any()) } returns ApiResponse(success = true) }

        s.repository.logout()

        coVerify(exactly = 1) { s.api.logout("Bearer jwt-a", "sess-a") }
    }

    @Test
    fun `l'appel part APRES la purge, et porte pourtant les jetons d'avant`() = runTest {
        var storeAtCallTime: Pair<String?, String?>? = null
        val store = InMemoryTokenStore(jwt = "jwt-a", sessionToken = "sess-a")
        val s = scenario(store) {
            coEvery { logout(any(), any()) } coAnswers {
                storeAtCallTime = store.jwt to store.sessionToken
                ApiResponse(success = true)
            }
        }

        s.repository.logout()

        assertThat(storeAtCallTime).isEqualTo(null to null)
        coVerify { s.api.logout("Bearer jwt-a", "sess-a") }
    }

    @Test
    fun `un compte qui s'est connecte entre-temps n'est pas la cible`() = runTest {
        val store = InMemoryTokenStore(jwt = "jwt-a", sessionToken = "sess-a")
        var sentAuthorization: String? = null
        val s = scenario(store) {
            coEvery { logout(any(), any()) } coAnswers {
                // Le compte B se connecte pendant que la fermeture de A est en vol.
                store.jwt = "jwt-b"
                store.sessionToken = "sess-b"
                sentAuthorization = firstArg()
                ApiResponse(success = true)
            }
        }

        s.repository.logout()

        assertThat(sentAuthorization).isEqualTo("Bearer jwt-a")
    }

    @Test
    fun `hors ligne, l'appareil est propre quand meme`() = runTest {
        val s = scenario { coEvery { logout(any(), any()) } throws IOException("offline") }
        s.session.adopt(MeeshyUser(id = "u1", username = "atabeth"))

        s.repository.logout()

        assertThat(s.store.isAuthenticated).isFalse()
        assertThat(s.session.currentUser.value).isNull()
        assertThat(s.teardown.wipes).isEqualTo(1)
    }

    @Test
    fun `une erreur inattendue de la passerelle ne bloque pas la deconnexion`() = runTest {
        val s = scenario { coEvery { logout(any(), any()) } throws IllegalStateException("boom") }

        s.repository.logout()

        assertThat(s.store.isAuthenticated).isFalse()
        assertThat(s.teardown.wipes).isEqualTo(1)
    }

    @Test
    fun `une passerelle muette est abandonnee, l'appareil est deja propre`() = runTest {
        val s = scenario {
            coEvery { logout(any(), any()) } coAnswers {
                delay(60_000)
                ApiResponse(success = true)
            }
        }

        s.repository.logout()

        assertThat(s.store.isAuthenticated).isFalse()
        assertThat(s.teardown.wipes).isEqualTo(1)
    }

    @Test
    fun `sans aucun jeton il n'y a rien a fermer cote passerelle`() = runTest {
        val s = scenario(InMemoryTokenStore()) { coEvery { logout(any(), any()) } returns ApiResponse(success = true) }

        s.repository.logout()

        coVerify(exactly = 0) { s.api.logout(any(), any()) }
        assertThat(s.teardown.wipes).isEqualTo(1)
    }

    @Test
    fun `sans JWT, le jeton de session part seul`() = runTest {
        val s = scenario(InMemoryTokenStore(sessionToken = "sess-a")) {
            coEvery { logout(any(), any()) } returns ApiResponse(success = true)
        }

        s.repository.logout()

        coVerify(exactly = 1) { s.api.logout(null, "sess-a") }
    }
}
