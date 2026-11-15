package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.plus
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.SessionRevocationReason
import me.meeshy.sdk.net.AuthExpiryInterceptor
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.Renewal
import me.meeshy.sdk.net.SessionExpiryNotifier
import me.meeshy.sdk.net.SessionRefresher
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.sync.SyncSeqTracker
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

/**
 * La course de l'audit : un renouvellement REFUSÉ démonte la session (jetons vidés) AVANT que l'intercepteur n'annonce
 * l'expiration. La fermeture doit pourtant avoir lieu, et l'avis être levé : la garde porte sur l'identité, pas les jetons.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionRevocationClosesADeadSessionTest {

    private class RecordingTeardown : SessionTeardown {
        var wipes = 0
            private set

        override suspend fun wipe() {
            wipes += 1
        }
    }

    @Test
    fun `un demontage par le renouvellement puis le 401 annonce ferment effectivement la session et l'expliquent`() = runTest {
        val api = mockk<AuthApi>(relaxed = true)
        val store = InMemoryTokenStore(jwt = "jwt-a", sessionToken = "sess-a")
        val session = SessionRepository(api, store)
        session.adopt(MeeshyUser(id = "u1", username = "atabeth"))
        val teardown = RecordingTeardown()
        val repository = AuthRepository(api, store, session, teardown, SyncSeqTracker())
        val refresher = SessionRefresher(store, nowEpochSeconds = { Double.MAX_VALUE }) { null }
        val expiry = SessionExpiryNotifier()
        val center = SessionRevocationCenter(
            revocations = emptyFlow(),
            expirations = expiry.expirations,
            activeAccount = { activeAccountOf(store, session) },
            isAwaitingRetirement = { false },
            closeSession = { repository.logout() },
            newId = { "n1" },
            now = { 1L },
        )
        center.start(backgroundScope + UnconfinedTestDispatcher(testScheduler))

        assertThat(refresher.renew("jwt-a", sentUnderGeneration = null)).isEqualTo(Renewal.Failed)
        assertThat(store.isAuthenticated).isFalse()

        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(401))
            server.start()
            val client = OkHttpClient.Builder()
                .addInterceptor(AuthExpiryInterceptor(signalsExpiry = refresher::signalsExpiry, onSessionExpired = expiry::notifyExpired))
                .build()
            client.newCall(Request.Builder().url(server.url("/api/v1/conversations")).build()).execute().close()
        }
        advanceUntilIdle()

        assertThat(center.notice.value?.reason).isEqualTo(SessionRevocationReason.SESSION_EXPIRED)
        assertThat(center.closed.value).isEqualTo("n1")
        assertThat(teardown.wipes).isEqualTo(1)
        assertThat(session.currentUserId).isNull()
        assertThat(activeAccountOf(store, session)).isNull()
    }
}
