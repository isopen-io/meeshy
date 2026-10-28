package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.Test

/** La fin d'une session d'invite : la purge complete d'une deconnexion, sans rien dire a la passerelle qui l'a deja fermee. */
class AuthRepositoryGuestSessionEndTest {
    private class RecordingTeardown : SessionTeardown {
        var wipes = 0
        override suspend fun wipe() { wipes += 1 }
    }

    private fun scenario(jwt: String?, sessionToken: String?): Triple<AuthRepository, InMemoryTokenStore, RecordingTeardown> {
        val api = mockk<AuthApi>(relaxed = true)
        val store = InMemoryTokenStore(jwt = jwt, sessionToken = sessionToken)
        val teardown = RecordingTeardown()
        return Triple(AuthRepository(api, store, SessionRepository(api, store), teardown, SyncSeqTracker()), store, teardown)
    }

    @Test
    fun `la session refusee est purgee en entier, jeton compris`() = runTest {
        val (repository, store, teardown) = scenario(jwt = null, sessionToken = "guest-1")

        assertThat(repository.endGuestSession(refusedToken = "guest-1")).isTrue()

        assertThat(store.sessionToken).isNull()
        assertThat(teardown.wipes).isEqualTo(1)
    }

    @Test
    fun `aucun appel de deconnexion ne part vers une session que la passerelle a fermee`() = runTest {
        val api = mockk<AuthApi>(relaxed = true)
        val store = InMemoryTokenStore(sessionToken = "guest-1")
        AuthRepository(api, store, SessionRepository(api, store), RecordingTeardown(), SyncSeqTracker())
            .endGuestSession(refusedToken = null)

        coVerify(exactly = 0) { api.logout(any(), any()) }
    }

    @Test
    fun `un refus tardif d une session quittee ne purge pas la session ouverte depuis`() = runTest {
        val (repository, store, teardown) = scenario(jwt = null, sessionToken = "guest-2")

        assertThat(repository.endGuestSession(refusedToken = "guest-1")).isFalse()

        assertThat(store.sessionToken).isEqualTo("guest-2")
        assertThat(teardown.wipes).isEqualTo(0)
    }

    @Test
    fun `un compte inscrit n est jamais deconnecte par la fin d une session d invite`() = runTest {
        val (repository, store, teardown) = scenario(jwt = "jwt", sessionToken = "guest-1")

        assertThat(repository.endGuestSession(refusedToken = "guest-1")).isFalse()

        assertThat(store.jwt).isEqualTo("jwt")
        assertThat(teardown.wipes).isEqualTo(0)
    }
}
