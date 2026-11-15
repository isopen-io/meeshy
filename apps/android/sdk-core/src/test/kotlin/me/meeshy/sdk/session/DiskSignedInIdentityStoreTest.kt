package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.InMemoryTokenStore
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DiskSignedInIdentityStoreTest {

    private lateinit var db: MeeshyDatabase
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() {
        scope.cancel()
        db.close()
    }

    private fun store(tokens: InMemoryTokenStore) = DiskSignedInIdentityStore(KeyedJsonCache(db.keyedJsonCacheDao()), tokens, scope)

    private suspend fun SignedInIdentityStore.eventually(userId: String, expected: (MeeshyUser?) -> Boolean): MeeshyUser? =
        withTimeoutOrNull(5_000) {
            var read = recall(userId)
            while (!expected(read)) {
                delay(20)
                read = recall(userId)
            }
            read
        } ?: recall(userId)

    @Test
    fun `the identity of the signed-in account survives on disk`() = runBlocking {
        val tokens = InMemoryTokenStore(jwt = "jwt", userId = "u1")
        val identity = MeeshyUser(id = "u1", username = "atabeth", displayName = "Atabeth Lune")

        store(tokens).remember(identity)

        assertThat(store(tokens).eventually("u1") { it != null }).isEqualTo(identity)
    }

    @Test
    fun `the latest identity wins`() = runBlocking {
        val tokens = InMemoryTokenStore(jwt = "jwt", userId = "u1")
        val identities = store(tokens)

        identities.remember(MeeshyUser(id = "u1", username = "atabeth", displayName = "Old"))
        identities.remember(MeeshyUser(id = "u1", username = "atabeth", displayName = "New"))

        assertThat(identities.eventually("u1") { it?.displayName == "New" }?.displayName).isEqualTo("New")
    }

    @Test
    fun `an identity whose account is no longer signed in is never written`() = runBlocking {
        val tokens = InMemoryTokenStore(jwt = "jwt", userId = "u2")
        val identities = store(tokens)

        identities.remember(MeeshyUser(id = "u1", username = "atabeth"))
        identities.remember(MeeshyUser(id = "u2", username = "lune"))

        assertThat(identities.eventually("u2") { it != null }?.id).isEqualTo("u2")
        assertThat(identities.recall("u1")).isNull()
    }
}
