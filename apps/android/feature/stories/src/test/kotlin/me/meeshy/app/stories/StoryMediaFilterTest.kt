package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.StoryFilterMatrix
import org.junit.Test

/** #13598 : le filtre d'un média touché ne colore que ce média, et voyage sur son objet. */
class StoryMediaFilterTest {
    private fun media(id: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun state(vararg ids: String): StoryComposerUiState {
        val deck = ids.fold(StorySlideDeck.single("s")) { acc, id -> acc.addMediaToSelected(id) }
        return StoryComposerUiState(deck = deck, attachments = ids.map(::media)).mirrorDraftToSelection()
    }

    @Test
    fun `choisir un filtre sur un media ne touche ni la scene ni les autres medias`() {
        val next = StoryComposerBackgroundReducer.mediaFilterSelected(state("a", "b").let { it.copy(deck = it.deck.setSelectedFilter(StoryFilter.WARM)) }, "a", StoryFilter.BW)
        val slide = next.deck.selectedSlide
        assertThat(slide.mediaFilters).containsExactly("a", StoryFilter.BW)
        assertThat(slide.filter).isEqualTo(StoryFilter.WARM)
        assertThat(next.mediaFilterOf("b")).isNull()
    }

    @Test
    fun `retirer le filtre d un media l efface, un media inconnu est inerte`() {
        val withFilter = StoryComposerBackgroundReducer.mediaFilterSelected(state("a"), "a", StoryFilter.BW)
        assertThat(StoryComposerBackgroundReducer.mediaFilterSelected(withFilter, "a", null).deck.selectedSlide.mediaFilters).isEmpty()
        assertThat(StoryComposerBackgroundReducer.mediaFilterSelected(withFilter, "zzz", StoryFilter.WARM)).isEqualTo(withFilter)
    }

    @Test
    fun `supprimer un media emporte son filtre`() {
        val deck = state("a").deck.setMediaFilter("a", StoryFilter.COOL).removeMedia("a")
        assertThat(deck.selectedSlide.mediaFilters).isEmpty()
    }

    @Test
    fun `le plateau peint le filtre de la scene puis celui du media montre`() {
        val base = state("a", "b").let { it.copy(deck = it.deck.setSelectedFilter(StoryFilter.WARM)) }
        assertThat(base.canvasFilterMatrix).isEqualTo(base.selectedSlideFilterMatrix)
        val filtered = base.copy(deck = base.deck.setMediaFilter("a", StoryFilter.BW))
        assertThat(filtered.canvasFilterMatrix).isEqualTo(
            SceneLookMatrix.compose(filtered.selectedSlideFilterMatrix, StoryFilterMatrix.effectiveMatrix(StoryFilter.BW, 1f)),
        )
        val other = base.copy(deck = base.deck.setMediaFilter("b", StoryFilter.BW))
        assertThat(other.canvasFilterMatrix).isEqualTo(base.selectedSlideFilterMatrix)
    }

    @Test
    fun `le filtre d un media voyage sur son objet et celui de la scene reste sur les effets`() {
        val request = StoryComposerDraft(
            mediaIds = listOf("m1"),
            filter = StoryFilter.WARM,
            backgroundMedia = StoryBackgroundMedia("m1", "https://cdn/m1.jpg", "image/jpeg", null, filter = StoryFilter.BW),
        ).toCreateStoryRequest("en")
        assertThat(request.storyEffects?.filter).isEqualTo("warm")
        assertThat(request.storyEffects?.mediaObjects?.single()?.filter).isEqualTo("bw")
    }

    @Test
    fun `un media sans filtre propre ne publie aucun filtre d objet`() {
        val request = StoryComposerDraft(
            mediaIds = listOf("m1"),
            backgroundMedia = StoryBackgroundMedia("m1", "https://cdn/m1.jpg", "image/jpeg", null),
        ).toCreateStoryRequest("en")
        assertThat(request.storyEffects?.mediaObjects?.single()?.filter).isNull()
    }

    @Test
    fun `le brouillon durable garde le filtre du media et ignore un jeton inconnu`() {
        val deck = state("a").deck.setMediaFilter("a", StoryFilter.CHROME)
        val snapshot = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "now")
        assertThat(snapshot.slides.single().mediaFilters).containsExactly("a", "chrome")
        assertThat(snapshot.toDeck()?.selectedSlide?.mediaFilters).containsExactly("a", StoryFilter.CHROME)
        val hostile = snapshot.copy(slides = snapshot.slides.map { it.copy(mediaFilters = mapOf("a" to "inconnu", "fantome" to "bw")) })
        assertThat(hostile.toDeck()?.selectedSlide?.mediaFilters).isEmpty()
    }
}
