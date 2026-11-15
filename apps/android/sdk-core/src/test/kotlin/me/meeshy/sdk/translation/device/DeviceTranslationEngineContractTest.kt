package me.meeshy.sdk.translation.device

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.translation.DeviceTranslationPair
import org.junit.Test

class DeviceTranslationEngineContractTest {

    private val pair = DeviceTranslationPair("fr", "en")

    private class FakeEngine(
        private val known: Map<String, String>,
        private val state: DeviceTranslationAvailability = DeviceTranslationAvailability.READY,
    ) : DeviceTranslationEngine {
        override val engineName = "fake"
        var cancelled = false
        override suspend fun availability(pair: DeviceTranslationPair) = state
        override suspend fun translate(
            requests: List<DeviceTranslationRequest>,
            pair: DeviceTranslationPair,
        ): List<DeviceTranslationResult> {
            if (cancelled) return emptyList()
            return requests.mapNotNull { r -> known[r.text]?.let { DeviceTranslationResult(r.id, it) } }
        }
        override fun cancelPending() { cancelled = true }
    }

    @Test
    fun `an untranslated text is absent from the result and never an error`() = runTest {
        val engine = FakeEngine(mapOf("bonjour" to "hello"))
        val result = engine.translate(
            listOf(DeviceTranslationRequest("a", "bonjour"), DeviceTranslationRequest("b", "inconnu")),
            pair,
        )
        assertThat(result).containsExactly(DeviceTranslationResult("a", "hello"))
    }

    @Test
    fun `results carry the id of their request`() = runTest {
        val engine = FakeEngine(mapOf("x" to "y"))
        val result = engine.translate(listOf(DeviceTranslationRequest("42", "x")), pair)
        assertThat(result.single().id).isEqualTo("42")
    }

    @Test
    fun `cancelling pending work returns what it has`() = runTest {
        val engine = FakeEngine(mapOf("x" to "y"))
        engine.cancelPending()
        assertThat(engine.translate(listOf(DeviceTranslationRequest("1", "x")), pair)).isEmpty()
    }

    @Test
    fun `the unavailable engine declares every pair unsupported and translates nothing`() = runTest {
        val engine = UnavailableDeviceTranslationEngine()
        assertThat(engine.availability(pair)).isEqualTo(DeviceTranslationAvailability.UNSUPPORTED)
        assertThat(engine.translate(listOf(DeviceTranslationRequest("1", "x")), pair)).isEmpty()
        assertThat(engine.engineName.length).isIn(1..64)
        engine.cancelPending()
    }

    @Test
    fun `the engine name is between 1 and 64 characters`() {
        assertThat(FakeEngine(emptyMap()).engineName.length).isIn(1..64)
    }
}
