package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.outbox.SessionOutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.Test

/** #13558 constat 2 : une session posée PAR-DESSUS une session vivante annule les envois en vol du compte remplacé. */
class AuthRepositoryAccountSwitchFenceTest {

    private fun session(id: String) = AuthSession(MeeshyUser(id = id, username = id), token = "jwt-$id", sessionToken = "s-$id")

    @Test
    fun `adopter B par-dessus A annule l'envoi en vol de A avant son prochain morceau`() = runTest {
        val api = mockk<AuthApi>()
        val store = InMemoryTokenStore()
        val transition = SessionTransitionFlags()
        val sessions = SessionRepository(api, store, transition)
        val fence = AccountFence(SessionOutboxOwnerSource(sessions, store), transition)
        val repository = AuthRepository(api, store, sessions, object : SessionTeardown {
            override suspend fun wipe() = Unit
        }, SyncSeqTracker(), fence)
        repository.adoptSession(session("A"))

        val nextChunk = CompletableDeferred<Unit>()
        var chunksSentUnder = mutableListOf<String?>()
        val sending = async {
            fence.guard(fence.ticket()) {
                nextChunk.await()
                chunksSentUnder += store.jwt
                "delivered"
            }
        }
        runCurrent()

        repository.adoptSession(session("B"))
        nextChunk.complete(Unit)

        val outcome: Any? = sending.await()
        assertThat(outcome).isNull()
        assertThat(chunksSentUnder).isEmpty()
    }

    private class RecordingTokenStore(private val inner: InMemoryTokenStore = InMemoryTokenStore()) : TokenStore by inner {
        val ownerAtJwtWrite = mutableListOf<Pair<String?, String?>>()
        override var jwt: String?
            get() = inner.jwt
            set(value) {
                ownerAtJwtWrite += value to inner.userId
                inner.jwt = value
            }
    }

    @Test
    fun `les jetons de B ne s'ecrivent jamais sous l'identite de A`() = runTest {
        val api = mockk<AuthApi>()
        val store = RecordingTokenStore()
        val transition = SessionTransitionFlags()
        val sessions = SessionRepository(api, store, transition)
        val fence = AccountFence(SessionOutboxOwnerSource(sessions, store), transition)
        val repository = AuthRepository(api, store, sessions, object : SessionTeardown {
            override suspend fun wipe() = Unit
        }, SyncSeqTracker(), fence)
        repository.adoptSession(session("A"))

        repository.adoptSession(session("B"))

        assertThat(store.ownerAtJwtWrite.filter { it.first == "jwt-B" }.map { it.second }).doesNotContain("A")
        assertThat(store.userId).isEqualTo("B")
        assertThat(store.jwt).isEqualTo("jwt-B")
    }

    @Test
    fun `readopter le meme compte n'annule rien`() = runTest {
        val api = mockk<AuthApi>()
        val store = InMemoryTokenStore()
        val transition = SessionTransitionFlags()
        val sessions = SessionRepository(api, store, transition)
        val fence = AccountFence(SessionOutboxOwnerSource(sessions, store), transition)
        val repository = AuthRepository(api, store, sessions, object : SessionTeardown {
            override suspend fun wipe() = Unit
        }, SyncSeqTracker(), fence)
        repository.adoptSession(session("A"))
        val release = CompletableDeferred<Unit>()
        val sending = async { fence.guard(fence.ticket()) { release.await(); "delivered" } }
        runCurrent()

        repository.adoptSession(session("A"))
        release.complete(Unit)

        assertThat(sending.await()).isEqualTo("delivered")
    }
}
