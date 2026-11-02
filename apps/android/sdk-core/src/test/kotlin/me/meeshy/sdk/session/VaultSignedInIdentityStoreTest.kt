package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.security.InMemorySecureStore
import me.meeshy.sdk.net.InMemoryTokenStore
import org.junit.After
import org.junit.Test

class VaultSignedInIdentityStoreTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val alice = MeeshyUser(id = "u1", username = "alice", displayName = "Alice")

    @After fun tearDown() = scope.cancel()

    private fun store(
        secure: InMemorySecureStore = InMemorySecureStore(),
        tokens: InMemoryTokenStore = InMemoryTokenStore(userId = "u1"),
        legacy: SignedInIdentityStore = SignedInIdentityStore.NONE,
    ) = VaultSignedInIdentityStore(AuthProfileVault(secure), tokens, legacy, scope)

    private suspend fun SignedInIdentityStore.eventually(id: String): MeeshyUser? = withTimeoutOrNull(5_000) {
        var read = recall(id)
        while (read == null) { delay(10); read = recall(id) }
        read
    }

    @Test
    fun `a remembered identity is served on the next cold start`() = runBlocking {
        val secure = InMemorySecureStore()
        store(secure).remember(alice)
        assertThat(store(secure).eventually("u1")).isEqualTo(alice)
    }

    @Test
    fun `an identity of another account than the tokens is never written`() = runBlocking {
        val secure = InMemorySecureStore()
        store(secure, InMemoryTokenStore(userId = "other")).remember(alice)
        delay(300)
        assertThat(store(secure).recall("u1")).isNull()
    }

    @Test
    fun `the legacy disk identity serves an upgraded install`() = runBlocking {
        val legacy = object : SignedInIdentityStore {
            override suspend fun recall(userId: String) = alice.takeIf { userId == "u1" }
            override fun remember(user: MeeshyUser) = Unit
        }
        assertThat(store(legacy = legacy).recall("u1")).isEqualTo(alice)
    }
}
