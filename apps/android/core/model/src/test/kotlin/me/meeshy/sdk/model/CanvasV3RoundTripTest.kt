package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CanvasV3FixtureSupport.assertSameJson
import me.meeshy.sdk.model.CanvasV3FixtureSupport.fixture
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class CanvasV3RoundTripTest {

    private fun JsonObject.objects(key: String): List<JsonObject> =
        (this[key] as JsonArray).map { it.jsonObject }

    private fun JsonObject.d(key: String): Double = (getValue(key) as JsonPrimitive).doubleOrNull!!

    private fun back(name: String): CanvasV3Migration.V1Wire =
        CanvasV3Migration.toV1(CanvasV3Migration.convert(fixture(name)))

    @Test
    fun `les ancres letterboxees reviennent a leur position v1 exacte`() {
        val original = fixture("v1-legacy-full")
        val restored = back("v1-legacy-full").effects

        fun positionOf(blob: JsonObject, key: String, id: String) =
            blob.objects(key).first { (it["id"] as JsonPrimitive).content == id }.let { it.d("x") to it.d("y") }

        listOf("textObjects" to "t1", "stickerObjects" to "st1", "locationObjects" to "L1", "audioPlayerObjects" to "a1")
            .forEach { (key, id) ->
                val (ox, oy) = positionOf(original, key, id)
                val (rx, ry) = positionOf(restored, key, id)
                assertThat(rx).isWithin(1e-12).of(ox)
                assertThat(ry).isWithin(1e-12).of(oy)
            }
        assertThat(restored.d("canvasAspectRatio")).isEqualTo(1.7777)
    }

    @Test
    fun `v3 puis v1 puis v3 redonne le meme document`() {
        for (name in listOf("v1-legacy-full", "v1-legacy-rich")) {
            val once = CanvasV3Migration.convert(fixture(name))
            val wire = CanvasV3Migration.toV1(once)
            val twice = CanvasV3Migration.convertDocument(
                listOf(wire.effects),
            )
            assertSameJson(once, twice, name)
        }
    }

    @Test
    fun `le fond la bande-son et les transitions survivent a l aller-retour`() {
        val restored = back("v1-legacy-full").effects
        assertThat((restored["background"] as JsonPrimitive).content).isEqualTo("color:#1E1B4B")
        assertThat((restored["filter"] as JsonPrimitive).content).isEqualTo("noir")
        assertThat((restored["backgroundAudioId"] as JsonPrimitive).content).isEqualTo("snd_nuits_ete")
        assertThat(restored.d("backgroundAudioEnd")).isEqualTo(17.0)
        assertThat(restored.d("timelineDuration")).isEqualTo(9.5)
        assertThat(restored.objects("clipTransitions")).hasSize(1)
        assertThat(restored.objects("voiceTranscriptions")).hasSize(2)
    }

    @Test
    fun `une bande revient a son bord et le memo la rend au fil`() {
        val banded = CanvasV3Migration.convertScene(
            fixture("v1-legacy-full"),
            bandEdges = mapOf("t1" to "top"),
        )!!
        val text = (banded["objects"] as JsonArray).map { it.jsonObject }.first { (it["id"] as JsonPrimitive).content == "t1" }
        val anchor = text.getValue("anchor").jsonObject
        assertThat((anchor["t"] as JsonPrimitive).content).isEqualTo("band")
        assertThat((anchor["edge"] as JsonPrimitive).content).isEqualTo("top")
    }
}
