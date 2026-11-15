package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

/**
 * Les images clés du composeur (#14271, iso iOS `addKeyframeAtPlayhead` + `ClipInspector.supportsKeyframes`) : une image
 * clé fige la pose de l'objet à la tête de lecture, au temps RELATIF à son départ. Un second geste au même instant la
 * retire. Elles voyagent jusqu'au fil, au brouillon et à la réouverture d'une story.
 */
class StoryComposerKeyframeTest {

    private fun text(start: Float, duration: Float, playhead: Float): StoryComposerUiState {
        val added = StoryComposerTextReducer.added(StoryComposerUiState(), "t1")
        val placed = added.copy(deck = added.deck.updateTextElement("t1") { it.copy(x = 0.3f, y = 0.7f, scale = 1.5f) })
        return StoryComposerSceneReducer.playheadMoved(StoryComposerSceneReducer.windowed(placed, "t1", start, duration), playhead)
    }

    private fun media(playhead: Float): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = listOf("m1"))
        val placed = StoryComposerPlacedMediaReducer.placed(StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s")), "m1")
        return StoryComposerSceneReducer.playheadMoved(placed, playhead)
    }

    private fun StoryComposerUiState.textKeyframes() = deck.selectedSlide.elements.single { it.id == "t1" }.keyframes

    @Test
    fun `une image cle fige la pose du texte a la tete, au temps relatif a son depart`() {
        val after = StoryComposerKeyframeReducer.toggled(text(start = 1f, duration = 3f, playhead = 2.5f), "t1")

        val frame = after.textKeyframes().single()
        assertThat(frame.time).isWithin(1e-4f).of(1.5f)
        assertThat(frame.x).isWithin(1e-4).of(0.3)
        assertThat(frame.y).isWithin(1e-4).of(0.7)
        assertThat(frame.scale).isWithin(1e-4).of(1.0)
        assertThat(frame.opacity).isNull()
        assertThat(frame.easing).isEqualTo(StoryEasing.LINEAR)
        assertThat(StoryComposerKeyframeReducer.keyframeAtPlayhead(after, "t1")).isEqualTo(frame)
    }

    @Test
    fun `le meme geste au meme instant retire l'image cle`() {
        val once = StoryComposerKeyframeReducer.toggled(text(start = 1f, duration = 3f, playhead = 2.5f), "t1")

        val twice = StoryComposerKeyframeReducer.toggled(once, "t1")

        assertThat(twice.textKeyframes()).isEmpty()
        assertThat(StoryComposerKeyframeReducer.keyframeAtPlayhead(twice, "t1")).isNull()
    }

    @Test
    fun `deux instants donnent deux images cles, rangees dans le temps`() {
        val first = StoryComposerKeyframeReducer.toggled(text(start = 0f, duration = 0f, playhead = 3f), "t1")
        val moved = StoryComposerSceneReducer.playheadMoved(first, 1f)

        val second = StoryComposerKeyframeReducer.toggled(moved, "t1")

        assertThat(second.textKeyframes().map { it.time }).containsExactly(1f, 3f).inOrder()
    }

    @Test
    fun `la tete hors de la fenetre de l'objet ne pose rien`() {
        val before = text(start = 1f, duration = 3f, playhead = 0.5f)

        assertThat(StoryComposerKeyframeReducer.toggled(before, "t1")).isEqualTo(before)
    }

    @Test
    fun `la frise montre le losange a l'instant absolu`() {
        val after = StoryComposerKeyframeReducer.toggled(text(start = 1f, duration = 3f, playhead = 2.5f), "t1")

        assertThat(after.sceneTracks.single { it.id == "t1" }.keyframeTimes).containsExactly(2.5)
    }

    @Test
    fun `un media pose prend une image cle et la porte jusqu'au fil`() {
        val after = StoryComposerKeyframeReducer.toggled(media(playhead = 2f), "m1")

        val placed = after.deck.selectedSlide.placedMedia.single()
        assertThat(placed.keyframes.map { it.time }).containsExactly(2f)
        val wire = placed.toMediaObject(url = null, mimeType = "image/jpeg", durationSeconds = null)
        assertThat(wire.keyframes).isEqualTo(placed.keyframes)
        assertThat(StoryPlacedMedia.foreground(listOf(wire)).single().keyframes).isEqualTo(placed.keyframes)
    }

    @Test
    fun `seuls le texte et le media pose se prennent en images cles`() {
        val state = text(start = 0f, duration = 0f, playhead = 1f)

        assertThat(StoryComposerKeyframeReducer.keyframableIds(state)).containsExactly("t1")
        assertThat(StoryComposerKeyframeReducer.toggled(state, "absent")).isEqualTo(state)
    }

    @Test
    fun `le texte porte ses images cles jusqu'au fil et les retrouve a la reouverture`() {
        val element = StoryComposerKeyframeReducer.toggled(text(start = 1f, duration = 3f, playhead = 2.5f), "t1")
            .deck.selectedSlide.elements.single()

        val wire = element.toTextObject("fr")

        assertThat(wire.keyframes).isEqualTo(element.keyframes)
        assertThat(wire.toElement().keyframes.map { it.time to it.scale }).isEqualTo(element.keyframes.map { it.time to it.scale })
    }

    @Test
    fun `l'image cle figee multiplie l'echelle pincee par un, donc le texte ne saute pas a la lecture`() {
        val element = StoryComposerKeyframeReducer.toggled(text(start = 1f, duration = 3f, playhead = 2.5f), "t1")
            .deck.selectedSlide.elements.single()

        val read = StoryTextObjectProjection.project(element.toTextObject("fr"), listOf("fr")).animated(atSeconds = 2.5f)

        assertThat(read.scale).isWithin(1e-4).of(element.scale.toDouble())
    }

    @Test
    fun `a la reouverture le facteur d'une image cle ne change pas, meme quand la taille de police reechelonne le texte`() {
        val frame = StoryKeyframe(id = "k", time = 1f, scale = 2.0)
        val wire = StoryTextObject(id = "t", text = "Salut", fontSize = 56.0, scale = 1.0, keyframes = listOf(frame))

        val element = wire.toElement()

        assertThat(element.keyframes.single().scale).isWithin(1e-4).of(2.0)
        assertThat(element.toTextObject("fr").keyframes!!.single().scale).isWithin(1e-4).of(2.0)
    }

    @Test
    fun `le brouillon garde les images cles du texte et du media pose`() {
        val withText = StoryComposerKeyframeReducer.toggled(text(start = 1f, duration = 3f, playhead = 2.5f), "t1")
        val withMedia = StoryComposerKeyframeReducer.toggled(media(playhead = 2f), "m1")

        val textBack = withText.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-11-01T00:00:00Z").toDeck()!!.selectedSlide.elements.single()
        val mediaBack = withMedia.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-11-01T00:00:00Z").toDeck()!!.selectedSlide.placedMedia.single()

        assertThat(textBack.keyframes).isEqualTo(withText.textKeyframes())
        assertThat(mediaBack.keyframes).isEqualTo(withMedia.deck.selectedSlide.placedMedia.single().keyframes)
    }
}
