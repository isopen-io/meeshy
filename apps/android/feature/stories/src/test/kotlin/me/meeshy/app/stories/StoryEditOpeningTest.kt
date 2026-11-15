package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.stories.StoryEditFixtures.BACKGROUND_VIDEO
import me.meeshy.app.stories.StoryEditFixtures.FOREGROUND_PHOTO
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.scene.StoryTextBackground
import org.junit.Test

class StoryEditOpeningTest {

    private val opening = StoryEditFixtures.opening()
    private val slide = opening.slide

    @Test
    fun `une story ecrite par iOS se recompose en une seule slide avec son texte`() {
        val state = StoryEditFixtures.opened(opening)

        assertThat(state.deck.slides).hasSize(1)
        assertThat(slide.text).isEqualTo("Bonjour")
        assertThat(state.draft.visibility).isEqualTo(StoryVisibility.FRIENDS)
    }

    @Test
    fun `les textes gardent leur style, leurs couleurs, leur fond et leur taille a l'ecran`() {
        val t1 = slide.elements.first { it.id == "t1" }

        assertThat(t1.text).isEqualTo("Salut")
        assertThat(t1.style).isEqualTo(StoryTextStyle.TYPEWRITER)
        assertThat(t1.color).isEqualTo("#FFD166")
        assertThat(t1.align).isEqualTo(StoryTextAlign.RIGHT)
        assertThat(t1.background).isInstanceOf(StoryTextBackground.Glass::class.java)
        assertThat(t1.outline.width).isEqualTo(2f)
        assertThat(t1.fade.inSeconds).isEqualTo(0.25f)
        assertThat(t1.timing.durationSeconds).isEqualTo(6f)
        // 120 × 1,2 = 144 à l'écran ; l'échelon le plus proche (96) porte l'écart : 96 × 1,5 = 144.
        assertThat(t1.size.designSize * t1.scale).isWithin(0.01f).of(144f)
        assertThat(slide.elements.map { it.id }).containsExactly("t1", "t2").inOrder()
    }

    @Test
    fun `les stickers emoji s'editent, l'image posee reste sur la scene sans y etre editable`() {
        assertThat(slide.stickers.map { it.id to it.emoji }).containsExactly("st2" to "✨")
        assertThat(opening.foreignStickers.map { it.first to it.second.id }).containsExactly(0 to "st1")
    }

    @Test
    fun `le fond, le filtre, la duree, le cadre, les dessins et les sons se retrouvent`() {
        assertThat(slide.background).isEqualTo(StoryBackgroundValue.parse("gradient:#1E1B4B,#6366F1"))
        assertThat(slide.filter).isEqualTo(StoryFilter.VINTAGE)
        assertThat(slide.filterIntensity).isWithin(0.001f).of(0.8f)
        assertThat(slide.durationSecondsPin).isEqualTo(9.5)
        assertThat(slide.frame.fitMode).isEqualTo("fit")
        assertThat(slide.frame.backdrop).isEqualTo("blur")
        assertThat(slide.frame.opening).isNotNull()
        assertThat(slide.strokes.map { it.id }).containsExactly("d1")
        assertThat(slide.audio.map { it.id }).containsExactly("a1")
    }

    @Test
    fun `le fond media est designe et la photo de premier plan est posee avec son filtre`() {
        assertThat(slide.backgroundMediaId).isEqualTo(BACKGROUND_VIDEO)
        assertThat(slide.backgroundLoop).isTrue()
        assertThat(slide.mediaIds).containsExactly(BACKGROUND_VIDEO, FOREGROUND_PHOTO).inOrder()
        val placed = slide.placedMedia.single()
        assertThat(placed.mediaId).isEqualTo(FOREGROUND_PHOTO)
        assertThat(placed.x).isWithin(0.001f).of(0.3f)
        assertThat(placed.scale).isWithin(0.001f).of(1.4f)
        assertThat(placed.filter).isEqualTo(StoryFilter.WARM)
        assertThat(placed.adjustments).isNotNull()
        assertThat(StoryEditFixtures.opened(opening).attachments.map { it.id }).containsExactly(BACKGROUND_VIDEO, FOREGROUND_PHOTO)
    }

    @Test
    fun `les references declarees reviennent, celles du texte non`() {
        assertThat(opening.mentions.map { it.username to it.display }).containsExactly("ana" to "NOTE")
    }

    @Test
    fun `une story ancienne sans objet de fond garde son premier media comme fond`() {
        val legacy = StoryEditFixtures.json.decodeFromString(
            me.meeshy.sdk.model.ApiPost.serializer(),
            """{ "id": "p2", "type": "STORY", "content": "x", "media": [ { "id": "bg1", "mimeType": "image/jpeg", "fileUrl": "https://cdn/bg1.jpg" } ],
                 "storyEffects": { "textObjects": [] } }""",
        )

        val legacyOpening = StoryEditFixtures.opening(legacy)

        assertThat(legacyOpening.slide.backgroundMediaId).isEqualTo("bg1")
        assertThat(legacyOpening.slide.mediaIds).containsExactly("bg1")
        assertThat(legacyOpening.originalBackground).isNull()
    }
}
