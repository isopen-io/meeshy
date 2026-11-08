package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneItemLayoutTest {

    private fun planOf(lists: SceneLists) =
        SceneRenderPlanner.plan(lists, time = 0.0, mode = SceneRenderMode.PLAY)

    @Test
    fun `un sticker a l echelle 1 mesure sa base sur la largeur de design`() {
        val item = planOf(SceneLists(stickers = listOf(StorySticker(id = "s", emoji = "🔥", baseSize = 108.0)))).single()
        val side = SceneItemLayout.stickerSide(item)
        assertThat(side.layout).isWithin(1e-9).of(0.1)
        assertThat(side.layer).isEqualTo(1.0)
    }

    @Test
    fun `un sticker tres agrandi laisse le surplus au calque`() {
        val item = planOf(SceneLists(stickers = listOf(StorySticker(id = "s", emoji = "🔥", baseSize = 1080.0, scale = 8.0)))).single()
        val side = SceneItemLayout.stickerSide(item)
        assertThat(side.layout).isEqualTo(SceneObjectNumbers.MAX_STICKER_LAYOUT_FRACTION)
        assertThat(side.layer).isWithin(1e-9).of(2.0)
    }

    @Test
    fun `un objet qui n est pas un sticker n a pas de cote`() {
        val item = planOf(SceneLists(texts = listOf(StoryTextObject(id = "t", text = "a")))).single()
        assertThat(SceneItemLayout.stickerSide(item).layout).isEqualTo(0.0)
    }

    @Test
    fun `un media carre mesure la moitie de la largeur a l echelle 1`() {
        val item = planOf(SceneLists(medias = listOf(StoryMediaObject(id = "m", aspectRatio = 1.0)))).single()
        val (w, h) = SceneItemLayout.mediaSize(item)!!
        assertThat(w).isWithin(1e-9).of(0.5)
        assertThat(h).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `lieu et puce audio sont des squelettes qui ne peignent rien`() {
        val items = planOf(
            SceneLists(
                places = listOf(place("p")),
                audios = listOf(audio("a")),
                texts = listOf(StoryTextObject(id = "t", text = "salut"), StoryTextObject(id = "e", text = "")),
            ),
        )
        assertThat(items.filter(SceneItemLayout::paints).map { it.id }).containsExactly("t")
    }
}
