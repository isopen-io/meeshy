package me.meeshy.sdk.translation.device

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.translation.DeviceTranslationPair
import org.junit.Test

/**
 * #14333 — la traduction sur l'appareil (conversation chiffrée) ne réécrit jamais le nom de
 * l'auteur d'un partage, une adresse, un e-mail ni un pseudo.
 */
class EntityShieldedDeviceTranslationEngineTest {

    private val pair = DeviceTranslationPair("fr", "es")
    private val sharedReel = "🔗 Reel de recretrait_b: https://staging.meeshy.me/l/I0tqQp"

    private class RewritingEngine(private val dropsMarkers: Boolean = false) : DeviceTranslationEngine {
        override val engineName = "tests-rewriter"
        val seen = mutableListOf<List<DeviceTranslationRequest>>()
        var cancelled = 0

        override suspend fun availability(pair: DeviceTranslationPair) = DeviceTranslationAvailability.READY

        override suspend fun translate(
            requests: List<DeviceTranslationRequest>,
            pair: DeviceTranslationPair,
        ): List<DeviceTranslationResult> {
            seen += requests
            return requests.map { DeviceTranslationResult(it.id, rewrite(it.text)) }
        }

        override fun cancelPending() { cancelled++ }

        private fun rewrite(text: String) = text.split(" ")
            .mapNotNull { word -> if ("🔹" in word) word.takeUnless { dropsMarkers } else "«$word»" }
            .joinToString(" ")
    }

    @Test
    fun `a share phrase keeps its author and link, and neither reaches the engine`() = runTest {
        val inner = RewritingEngine()
        val result = EntityShieldedDeviceTranslationEngine(inner)
            .translate(listOf(DeviceTranslationRequest("m1", sharedReel)), pair)

        val text = result.single().text
        assertThat(result.single().id).isEqualTo("m1")
        assertThat(text).startsWith("🔗")
        assertThat(text).contains("recretrait_b")
        assertThat(text).contains("https://staging.meeshy.me/l/I0tqQp")
        val given = inner.seen.flatten().joinToString { it.text }
        assertThat(given).doesNotContain("recretrait_b")
        assertThat(given).doesNotContain("https://")
    }

    @Test
    fun `an engine that loses markers is asked again between them`() = runTest {
        val inner = RewritingEngine(dropsMarkers = true)
        val result = EntityShieldedDeviceTranslationEngine(inner)
            .translate(listOf(DeviceTranslationRequest("m1", "Écris à contact@meeshy.me vite")), pair)

        assertThat(result).containsExactly(DeviceTranslationResult("m1", "«Écris» «à» contact@meeshy.me «vite»"))
        assertThat(inner.seen).hasSize(2)
    }

    @Test
    fun `an address alone is served as is without calling the engine`() = runTest {
        val inner = RewritingEngine()
        val result = EntityShieldedDeviceTranslationEngine(inner)
            .translate(listOf(DeviceTranslationRequest("m1", "https://a.com/x")), pair)

        assertThat(result).containsExactly(DeviceTranslationResult("m1", "https://a.com/x"))
        assertThat(inner.seen).isEmpty()
    }

    @Test
    fun `name, availability and cancellation are those of the shielded engine`() = runTest {
        val inner = RewritingEngine()
        val engine = EntityShieldedDeviceTranslationEngine(inner)

        engine.cancelPending()

        assertThat(engine.engineName).isEqualTo("tests-rewriter")
        assertThat(engine.availability(pair)).isEqualTo(DeviceTranslationAvailability.READY)
        assertThat(inner.cancelled).isEqualTo(1)
    }
}
