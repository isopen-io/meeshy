package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StorySlide
import org.junit.Test

class ComposerRailDoorBadgeTest {
    private fun matter(
        texts: Int = 0, media: Int = 0, sounds: Int = 0, stickers: Int = 0, places: Int = 0,
        hashtags: Int = 0, mentions: Int = 0, strokes: Int = 0, hasDescription: Boolean = false, hasContent: Boolean = false,
    ) = ComposerRailMatter(texts, media, sounds, stickers, places, hashtags, mentions, strokes, hasDescription, hasContent)

    @Test
    fun `a door that carries nothing shows no badge`() {
        ComposerRailDoor.entries.forEach { assertThat(ComposerRailDoorBadge.count(it, matter())).isNull() }
    }

    @Test
    fun `each door counts its own matter`() {
        val m = matter(texts = 3, media = 2, sounds = 1, stickers = 4, places = 5, hashtags = 6, mentions = 7, strokes = 8)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.TEXT, m)).isEqualTo(3)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.MEDIA, m)).isEqualTo(2)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.SOUND, m)).isEqualTo(1)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.STICKER, m)).isEqualTo(4)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.PLACE, m)).isEqualTo(5)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.HASHTAG, m)).isEqualTo(6)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.MENTION, m)).isEqualTo(7)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.DRAWING, m)).isEqualTo(8)
    }

    @Test
    fun `the background door never counts and a written description or body counts one`() {
        val m = matter(hasDescription = true, hasContent = true)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.BACKGROUND, m)).isNull()
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.DESCRIPTION, m)).isEqualTo(1)
        assertThat(ComposerRailDoorBadge.count(ComposerRailDoor.CONTENT, m)).isEqualTo(1)
    }

    @Test
    fun `badges lists only the doors that carry something`() {
        val badges = ComposerRailDoorBadge.badges(
            listOf(ComposerRailDoor.TEXT, ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND),
            matter(texts = 2, sounds = 1),
        )
        assertThat(badges).containsExactly(ComposerRailDoor.TEXT, 2, ComposerRailDoor.SOUND, 1)
    }

    @Test
    fun `matter of an empty slide is empty and blank text counts for nothing`() {
        val m = ComposerRailDoorBadge.matter(
            slide = StorySlide(id = "s", effects = StoryEffects()), hashtags = 0,
            description = "  \n", content = " ", mentions = 0, hasDocumentLocation = false,
        )
        assertThat(m).isEqualTo(ComposerRailMatter())
    }

    @Test
    fun `the document location counts as a place beside the slide's places`() {
        val m = ComposerRailDoorBadge.matter(
            slide = StorySlide(id = "s"), hashtags = 2, description = "d", content = "c", mentions = 3, hasDocumentLocation = true,
        )
        assertThat(m.places).isEqualTo(1)
        assertThat(m.hashtags).isEqualTo(2)
        assertThat(m.mentions).isEqualTo(3)
        assertThat(m.hasDescription).isTrue()
        assertThat(m.hasContent).isTrue()
    }
}
