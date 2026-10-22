package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CanvasV3MigrationTypedTest {

    private fun effects() = StoryEffects(
        background = "color:#112233",
        textObjects = listOf(
            StoryTextObject(
                id = "t1", text = "Salut", x = 0.5, y = 0.2, zIndex = 3, startTime = 1.0,
                keyframes = listOf(StoryKeyframe(time = 1f, opacity = 0.0), StoryKeyframe(time = 2f, opacity = 1.0)),
            ),
        ),
        stickerObjects = listOf(StorySticker(id = "st", emoji = "🔥", x = 0.8, y = 0.7)),
        audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "a", postMediaId = "pm", y = 0.6)),
        opening = StoryTransitionEffect.FADE,
        closing = StoryTransitionEffect.ZOOM,
        backgroundAudioId = "snd",
        backgroundAudioVolume = 0.5f,
        layout = MosaicLayoutMode.HERO,
    )

    @Test
    fun `chaque famille d objet est couverte et le defaut n est pas emis`() {
        val doc = CanvasV3Migration.migrate(effects())
        val kinds = doc.scenes.single().objects.associateBy { it.id }
        assertThat(kinds.getValue("bg").plane).isEqualTo("bg")
        assertThat(kinds.getValue("t1").kind).isEqualTo("text")
        assertThat(kinds.getValue("t1").payload.keys).containsExactly("text")
        assertThat(kinds.getValue("st").kind).isEqualTo("sticker")
        assertThat(kinds.getValue("a").kind).isEqualTo("audio")
        assertThat(doc.v).isEqualTo(3)
        assertThat(doc.sound?.source?.soundId).isEqualTo("snd")
        assertThat(doc.sound?.volume).isEqualTo(0.5)
    }

    @Test
    fun `les keyframes et la fenetre voyagent dans le timing`() {
        val text = CanvasV3Migration.migrate(effects()).scenes.single().objects.first { it.id == "t1" }
        assertThat(text.timing?.start).isEqualTo(1.0)
        assertThat(text.timing?.keyframes?.map { it.time }).containsExactly(1f, 2f).inOrder()
        assertThat(text.z).isEqualTo(3)
    }

    @Test
    fun `les transitions voyagent et le ratio du porteur letterboxe les ancres`() {
        val doc = CanvasV3Migration.migrate(effects(), carrierAspect = 16.0 / 9.0)
        val scene = doc.scenes.single()
        assertThat(scene.opening?.get("type")?.toString()).isEqualTo("\"fade\"")
        assertThat(scene.closing?.get("type")?.toString()).isEqualTo("\"zoom\"")
        assertThat(scene.carrierAspect).isEqualTo(16.0 / 9.0)
        val text = scene.objects.first { it.id == "t1" }
        assertThat(text.anchor.y).isGreaterThan(0.3)
        val back = StoryEffects.rendering(doc)
        assertThat(back.textObjects.single().y).isWithin(1e-12).of(0.2)
        assertThat(back.stickerObjects?.single()?.y).isWithin(1e-12).of(0.7)
    }

    @Test
    fun `un canvas vide n emet aucune scene`() {
        assertThat(CanvasV3Migration.migrate(StoryEffects()).scenes).isEmpty()
    }

    @Test
    fun `la onzieme scene est coupee avant le fil`() {
        val slides = List(12) { kotlinx.serialization.json.buildJsonObject { put("background", kotlinx.serialization.json.JsonPrimitive("color:#000000")) } }
        val doc = CanvasV3Migration.convertDocument(slides)
        assertThat((doc["scenes"] as kotlinx.serialization.json.JsonArray)).hasSize(10)
    }
}
