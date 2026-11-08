package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MessagePreferences
import me.meeshy.sdk.model.PreferenceCategoryCodecs
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesCategoryApi
import org.junit.Test
import java.io.IOException

class PreferencesCategoryRepositoryTest {

    private class FixedClock(private val now: Long) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private class ScriptedReadApi : PreferencesCategoryApi {
        var response: ApiResponse<JsonElement> = ApiResponse(success = false, error = "offline")
        var offline = false
        val asked = mutableListOf<String>()

        override suspend fun getBlock(category: String): ApiResponse<JsonElement> {
            asked += category
            if (offline) throw IOException("no network")
            return response
        }
    }

    private val now = 1_000_000L
    private val codec = PreferenceCategoryCodecs.message

    private class Rig(
        val read: ScriptedReadApi,
        val write: ScriptedPreferencesApi,
        val store: InMemoryPreferenceSnapshotStore,
        val repository: PreferencesCategoryRepository,
    )

    private fun rig(): Rig {
        val read = ScriptedReadApi()
        val write = ScriptedPreferencesApi()
        val store = InMemoryPreferenceSnapshotStore()
        return Rig(read, write, store, PreferencesCategoryRepository(read, write, store, FixedClock(now)))
    }

    @Test
    fun `a fresh snapshot is served without touching the network`() = runTest {
        val rig = rig()
        rig.store.save("block:message", codec.storageValue(MessagePreferences(sendOnEnter = false)), now)

        val first = rig.repository.stream(codec).first()

        assertThat(first).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat((first as CacheResult.Fresh).value.sendOnEnter).isFalse()
        assertThat(rig.read.asked).isEmpty()
    }

    @Test
    fun `an offline read still serves the last snapshot and a failed refresh keeps it`() = runTest {
        val rig = rig()
        rig.store.save("block:message", codec.storageValue(MessagePreferences(sendOnEnter = false)), now - 10_000_000L)
        rig.read.offline = true

        val failure = runCatching { rig.repository.refresh(codec) }

        assertThat(failure.isFailure).isTrue()
        assertThat(rig.repository.cached(codec).sendOnEnter).isFalse()
    }

    @Test
    fun `a refresh stores the served block with the keys this client does not know`() = runTest {
        val rig = rig()
        rig.read.response = ApiResponse(
            success = true,
            data = Json.parseToJsonElement("""{"enableMarkdown":false,"futureKnob":{"a":1}}"""),
        )

        rig.repository.refresh(codec)

        val block = rig.repository.cached(codec)
        assertThat(rig.read.asked).containsExactly("message")
        assertThat(block.enableMarkdown).isFalse()
        assertThat(block.extras["futureKnob"]).isNotNull()
    }

    @Test
    fun `updating applies locally then sends the full snapshot with the extras`() = runTest {
        val rig = rig()
        val block = MessagePreferences(sendOnEnter = false, extras = mapOf("futureKnob" to JsonPrimitive(7)))

        val result = rig.repository.update(codec, block)

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
        assertThat(rig.repository.cached(codec)).isEqualTo(block)
        val (category, body) = rig.write.patchedBlocks.single()
        assertThat(category).isEqualTo("message")
        assertThat(body["futureKnob"]).isEqualTo(JsonPrimitive(7))
        assertThat(body["maxCharacterLimit"]).isEqualTo(JsonPrimitive(5000))
    }

    @Test
    fun `a refused update rolls the snapshot back`() = runTest {
        val rig = rig()
        rig.store.save("block:message", codec.storageValue(MessagePreferences()), now)
        rig.write.patchBlockResponse = ApiResponse(success = false, error = "refused", code = "FORBIDDEN")

        val result = rig.repository.update(codec, MessagePreferences(sendOnEnter = false))

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(rig.repository.cached(codec).sendOnEnter).isTrue()
    }

    @Test
    fun `a cold key reads as the server defaults`() = runTest {
        assertThat(rig().repository.cached(codec)).isEqualTo(MessagePreferences())
    }
}
