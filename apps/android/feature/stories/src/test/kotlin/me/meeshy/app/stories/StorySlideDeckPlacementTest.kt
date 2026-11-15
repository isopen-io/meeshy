package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.SceneObjectCaps
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StorySlideDeckPlacementTest {

    @Test
    fun `le premier objet d une slide vide se pose au centre`() {
        assertThat(StorySlideDeck.single("a").nextObjectPosition().x).isEqualTo(0.5)
    }

    @Test
    fun `un texte puis un sticker ne se posent jamais au meme point`() {
        val withText = StorySlideDeck.single("a").addTextElementToSelected(StoryTextElement(id = "t"))
        val at = withText.nextObjectPosition()
        val withSticker = withText.addStickerToSelected(
            StoryStickerElement(id = "s", emoji = "x", x = at.x.toFloat(), y = at.y.toFloat()),
        )
        val next = withSticker.nextObjectPosition()
        assertThat(at.x).isGreaterThan(0.5)
        assertThat(next.x).isGreaterThan(at.x)
    }

    @Test
    fun `les plafonds du deck sont ceux de la loi de plafonds`() {
        assertThat(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE).isEqualTo(SceneObjectCaps.TEXT)
        assertThat(StorySlideDeck.MAX_MEDIA_PER_SLIDE).isEqualTo(SceneObjectCaps.MEDIA)
        assertThat(StorySlideDeck.MAX_STICKERS_PER_SLIDE).isEqualTo(SceneObjectCaps.STICKER)
    }
}
