package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

class SceneManipulationLayerRuleTest {

    private fun background() = StoryMediaObject(id = "bg", isBackground = true)
    private fun placed() = StoryMediaObject(id = "fg", isBackground = false)

    @Test
    fun `une slide vierge ne se manipule pas`() {
        assertThat(SceneManipulationLayerRule.resolve(SceneLists())).isEqualTo(SceneManipulationLayer.CANVAS)
    }

    @Test
    fun `un fond seul est manipulable`() {
        val lists = SceneLists(medias = listOf(background()))
        assertThat(SceneManipulationLayerRule.resolve(lists)).isEqualTo(SceneManipulationLayer.BACKGROUND)
    }

    @Test
    fun `texte, sticker, lieu ou media de premier plan font passer la main au premier plan`() {
        val withText = SceneLists(medias = listOf(background()), texts = listOf(StoryTextObject(id = "t")))
        val withSticker = SceneLists(medias = listOf(background()), stickers = listOf(StorySticker(id = "s")))
        val withPlace = SceneLists(places = listOf(StoryLocationObject(id = "p", place = SharedPlace(1.0, 2.0))))
        val withMedia = SceneLists(medias = listOf(background(), placed()))
        listOf(withText, withSticker, withPlace, withMedia).forEach {
            assertThat(SceneManipulationLayerRule.resolve(it)).isEqualTo(SceneManipulationLayer.FOREGROUND)
        }
    }

    @Test
    fun `un jeton Arriere-plan force la couche tant qu'un fond existe`() {
        val lists = SceneLists(medias = listOf(background()), texts = listOf(StoryTextObject(id = "t")))
        assertThat(SceneManipulationLayerRule.resolve(lists, SceneManipulationLayer.BACKGROUND))
            .isEqualTo(SceneManipulationLayer.BACKGROUND)
    }

    @Test
    fun `un jeton pointant une couche vide retombe sur l'auto-derivation`() {
        val textOnly = SceneLists(texts = listOf(StoryTextObject(id = "t")))
        assertThat(SceneManipulationLayerRule.resolve(textOnly, SceneManipulationLayer.BACKGROUND))
            .isEqualTo(SceneManipulationLayer.FOREGROUND)
        val bgOnly = SceneLists(medias = listOf(background()))
        assertThat(SceneManipulationLayerRule.resolve(bgOnly, SceneManipulationLayer.FOREGROUND))
            .isEqualTo(SceneManipulationLayer.BACKGROUND)
    }

    @Test
    fun `le jeton Premier plan force le premier plan quand il existe`() {
        val lists = SceneLists(texts = listOf(StoryTextObject(id = "t")))
        assertThat(SceneManipulationLayerRule.resolve(lists, SceneManipulationLayer.FOREGROUND))
            .isEqualTo(SceneManipulationLayer.FOREGROUND)
    }

    @Test
    fun `un jeton Canvas ou nul laisse l'auto-derivation`() {
        val bgOnly = SceneLists(medias = listOf(background()))
        assertThat(SceneManipulationLayerRule.resolve(bgOnly, SceneManipulationLayer.CANVAS))
            .isEqualTo(SceneManipulationLayer.BACKGROUND)
    }

    @Test
    fun `la regle se lit aussi depuis deux booleens`() {
        assertThat(SceneManipulationLayerRule.resolve(hasForeground = true, hasBackground = true))
            .isEqualTo(SceneManipulationLayer.FOREGROUND)
        assertThat(SceneManipulationLayerRule.resolve(hasForeground = false, hasBackground = false))
            .isEqualTo(SceneManipulationLayer.CANVAS)
    }
}
