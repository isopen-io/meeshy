package me.meeshy.sdk.preferences

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationReorderItem
import me.meeshy.sdk.model.PreferenceCategory
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.UserPreferences
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class PreferencesRepositoryTest {

    private class FixedClock(private val now: Long) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private val json = Json { ignoreUnknownKeys = true }
    private val now = 1_000_000L

    private class Rig(
        val api: ScriptedPreferencesApi = ScriptedPreferencesApi(),
        val conversationApi: ScriptedConversationPreferencesApi = ScriptedConversationPreferencesApi(),
        val store: InMemoryPreferenceSnapshotStore = InMemoryPreferenceSnapshotStore(),
        val repository: PreferencesRepository,
    )

    private fun rig(): Rig {
        val api = ScriptedPreferencesApi()
        val conversationApi = ScriptedConversationPreferencesApi()
        val store = InMemoryPreferenceSnapshotStore()
        return Rig(api, conversationApi, store, PreferencesRepository(api, conversationApi, store, json, FixedClock(now)))
    }

    private suspend fun Rig.seedAll(prefs: UserPreferences, syncedAt: Long = now) =
        store.save("all", json.encodeToString(UserPreferences.serializer(), prefs), syncedAt)

    private suspend fun Rig.cachedAll(): UserPreferences? =
        store.observe("all").first()?.let { json.decodeFromString(UserPreferences.serializer(), it) }

    private fun hiddenStatus() = UserPreferences(privacy = PrivacyPreferences(showOnlineStatus = false))

    @Test
    fun `a fresh cache is served at once without a network read`() = runTest {
        val rig = rig()
        rig.seedAll(hiddenStatus())

        val first = rig.repository.allPreferencesStream().first()

        assertThat(first).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat((first as CacheResult.Fresh).value.privacy.showOnlineStatus).isFalse()
        assertThat(rig.api.allCalls).isEqualTo(0)
    }

    @Test
    fun `a stale cache is shown first then replaced by the revalidated aggregate`() = runTest {
        val rig = rig()
        rig.seedAll(hiddenStatus(), syncedAt = now - 10_000L)
        rig.api.all = okResponse(UserPreferences())
        val policy = CachePolicy(freshForMillis = 1_000L, keepForMillis = 100_000L)

        rig.repository.allPreferencesStream(policy).test {
            val cached = awaitItem()
            assertThat(cached).isInstanceOf(CacheResult.Stale::class.java)
            assertThat(cached.valueOrNullForTest()?.privacy?.showOnlineStatus).isFalse()
            val fresh = awaitItem()
            assertThat(fresh).isInstanceOf(CacheResult.Fresh::class.java)
            assertThat(fresh.valueOrNullForTest()?.privacy?.showOnlineStatus).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a failed revalidation keeps the cached aggregate and reports the error`() = runTest {
        val rig = rig()
        rig.seedAll(hiddenStatus(), syncedAt = now - 10_000L)
        val errors = mutableListOf<Throwable>()
        val policy = CachePolicy(freshForMillis = 1_000L, keepForMillis = 100_000L)

        val emissions = mutableListOf<CacheResult<UserPreferences>>()
        val job = launch {
            rig.repository.allPreferencesStream(policy, onSyncError = { errors += it }).collect { emissions += it }
        }
        advanceUntilIdle()
        job.cancel()

        assertThat(emissions.first()).isInstanceOf(CacheResult.Stale::class.java)

        assertThat(errors.map { it.message }).containsExactly("offline")
        assertThat(rig.cachedAll()?.privacy?.showOnlineStatus).isFalse()
    }

    @Test
    fun `patch applies locally, sends the block and keeps the new value on success`() = runTest {
        val rig = rig()
        rig.seedAll(UserPreferences())

        val result = rig.repository.patch(
            PreferenceCategory.PRIVACY,
            JsonObject(mapOf("showOnlineStatus" to JsonPrimitive(false))),
        )

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(rig.api.patchedBlocks.map { it.first }).containsExactly("privacy")
        assertThat(rig.cachedAll()?.privacy?.showOnlineStatus).isFalse()
    }

    @Test
    fun `patch rolls the cache back when the gateway refuses`() = runTest {
        val rig = rig()
        rig.seedAll(UserPreferences())
        rig.api.patchBlockResponse = refused()

        val result = rig.repository.patch(
            PreferenceCategory.PRIVACY,
            JsonObject(mapOf("showOnlineStatus" to JsonPrimitive(false))),
        )

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(rig.cachedAll()?.privacy?.showOnlineStatus).isTrue()
    }

    @Test
    fun `reset deletes the block then adopts what the gateway now serves`() = runTest {
        val rig = rig()
        rig.seedAll(hiddenStatus())
        rig.api.all = okResponse(UserPreferences())

        val result = rig.repository.reset(PreferenceCategory.PRIVACY)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(rig.api.resetBlocks).containsExactly("privacy")
        assertThat(rig.cachedAll()?.privacy).isEqualTo(PrivacyPreferences())
    }

    @Test
    fun `reset falls back to local defaults when the re-read fails`() = runTest {
        val rig = rig()
        rig.seedAll(hiddenStatus())

        rig.repository.reset(PreferenceCategory.PRIVACY)

        assertThat(rig.cachedAll()?.privacy).isEqualTo(PrivacyPreferences())
    }

    @Test
    fun `a refused reset leaves the cache untouched`() = runTest {
        val rig = rig()
        rig.seedAll(hiddenStatus())
        rig.api.resetResponse = refused()

        val result = rig.repository.reset(PreferenceCategory.PRIVACY)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(rig.cachedAll()?.privacy?.showOnlineStatus).isFalse()
    }

    @Test
    fun `conversation tags are derived from the preference rows and cached`() = runTest {
        val rig = rig()
        rig.conversationApi.list = okResponse(
            listOf(
                ApiConversationPreferences(tags = listOf("work", "Alpha")),
                ApiConversationPreferences(tags = listOf("work", " beta ")),
            ),
        )

        rig.repository.conversationTagsStream().test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            val loaded = awaitItem()
            assertThat(loaded.valueOrNullForTest()).containsExactly("Alpha", "beta", "work").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a conversation preference row is cached under its own key`() = runTest {
        val rig = rig()
        rig.conversationApi.one = okResponse(ApiConversationPreferences(isPinned = true, categoryId = "work"))

        rig.repository.conversationPreferencesStream("c1").test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            val loaded = awaitItem()
            assertThat(loaded.valueOrNullForTest()?.categoryId).isEqualTo("work")
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(rig.store.observe("conversation:c1").first()).isNotNull()
    }

    @Test
    fun `a reorder is sent as one batch`() = runTest {
        val rig = rig()

        val outcome = rig.repository.reorderConversations(listOf(ConversationReorderItem("a", 1), ConversationReorderItem("b", 0)))

        assertThat(outcome).isEqualTo(ReorderOutcome.Sent)
        assertThat(rig.conversationApi.reorders.single().updates).hasSize(2)
    }

    @Test
    fun `an offline reorder is queued and flushed with the latest order per row`() = runTest {
        val rig = rig()
        rig.conversationApi.throwNetwork = true

        val queued = rig.repository.reorderConversations(listOf(ConversationReorderItem("a", 1), ConversationReorderItem("b", 0)))
        val queuedAgain = rig.repository.reorderConversations(listOf(ConversationReorderItem("a", 0)))
        rig.conversationApi.throwNetwork = false
        val flushed = rig.repository.flushPendingReorder()

        assertThat(queued).isEqualTo(ReorderOutcome.Queued)
        assertThat(queuedAgain).isEqualTo(ReorderOutcome.Queued)
        assertThat(flushed).isEqualTo(ReorderOutcome.Sent)
        assertThat(rig.conversationApi.reorders.last().updates)
            .containsExactly(ConversationReorderItem("a", 0), ConversationReorderItem("b", 0))
        assertThat(rig.repository.flushPendingReorder()).isEqualTo(ReorderOutcome.Sent)
        assertThat(rig.conversationApi.reorders).hasSize(3)
    }

    @Test
    fun `a refused reorder is reported and not held`() = runTest {
        val rig = rig()
        rig.conversationApi.reorderResponse = refused()

        val outcome = rig.repository.reorderConversations(listOf(ConversationReorderItem("a", 0)))
        rig.conversationApi.reorderResponse = okResponse(Unit)
        rig.repository.flushPendingReorder()

        assertThat(outcome).isEqualTo(ReorderOutcome.Rejected("refused"))
        assertThat(rig.conversationApi.reorders).hasSize(1)
    }

    private fun <T> CacheResult<T>.valueOrNullForTest(): T? = when (this) {
        is CacheResult.Fresh -> value
        is CacheResult.Stale -> value
        is CacheResult.Syncing -> value
        CacheResult.Empty -> null
    }
}
