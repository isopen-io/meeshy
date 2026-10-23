package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test

class SceneMotionTest {

    private fun obj(kind: String, timing: TimingV3? = null, vararg payload: Pair<String, JsonPrimitive>) =
        ObjectV3(id = "o", kind = kind, timing = timing, payload = JsonObject(mapOf(*payload)))

    private fun scene(vararg objects: ObjectV3, opening: JsonObject? = null, transitions: List<JsonObject>? = null) =
        SceneV3(id = "s", objects = objects.toList(), opening = opening, clipTransitions = transitions)

    @Test
    fun `un canvas de texte fixe n est pas cinematique`() {
        val text = obj("text", payload = arrayOf("duration" to JsonPrimitive(0)))
        assertThat(SceneMotion.isCinematic(scene(text))).isFalse()
        assertThat(SceneMotion.isCinematic(CanvasV3(scenes = listOf(scene(text))))).isFalse()
    }

    @Test
    fun `une video rend la scene cinematique`() {
        val video = obj("media", payload = arrayOf("mediaType" to JsonPrimitive("video/mp4")))
        assertThat(SceneMotion.isCinematic(scene(video))).isTrue()
    }

    @Test
    fun `une image affichee longtemps ne bouge pas`() {
        val photo = obj("media", payload = arrayOf("mediaType" to JsonPrimitive("image"), "duration" to JsonPrimitive(10)))
        assertThat(SceneMotion.isCinematic(scene(photo))).isFalse()
    }

    @Test
    fun `un son une decoration animee une fenetre de temps et une transition sont chacun suffisants`() {
        assertThat(SceneMotion.isCinematic(scene(obj("audio")))).isTrue()
        assertThat(SceneMotion.isCinematic(scene(obj("sticker", payload = arrayOf("animation" to JsonPrimitive("pop")))))).isTrue()
        assertThat(SceneMotion.isCinematic(scene(obj("sticker", payload = arrayOf("animation" to JsonPrimitive("")))))).isFalse()
        assertThat(SceneMotion.isCinematic(scene(obj("text", timing = TimingV3(start = 1.0))))).isTrue()
        assertThat(SceneMotion.isCinematic(scene(obj("text", payload = arrayOf("fadeIn" to JsonPrimitive(0.5)))))).isTrue()
        assertThat(SceneMotion.isCinematic(scene(obj("text"), transitions = listOf(JsonObject(emptyMap()))))).isTrue()
        assertThat(SceneMotion.isCinematic(scene(obj("text"), opening = JsonObject(emptyMap())))).isTrue()
    }

    @Test
    fun `un son de fond rend le document cinematique et audible`() {
        val doc = CanvasV3(scenes = listOf(scene(obj("text"))), sound = BackgroundSoundV3())
        assertThat(SceneMotion.isCinematic(doc)).isTrue()
        assertThat(SceneMotion.isAudible(doc)).isTrue()
    }

    @Test
    fun `une video muette bouge sans rien faire entendre`() {
        val muted = obj(
            "media",
            payload = arrayOf("mediaType" to JsonPrimitive("video"), "muted" to JsonPrimitive(true)),
        )
        val doc = CanvasV3(scenes = listOf(scene(muted)))
        assertThat(SceneMotion.isCinematic(doc)).isTrue()
        assertThat(SceneMotion.isAudible(doc)).isFalse()
        val loud = obj("media", payload = arrayOf("mediaType" to JsonPrimitive("video")))
        assertThat(SceneMotion.isAudible(CanvasV3(scenes = listOf(scene(loud))))).isTrue()
    }
}
