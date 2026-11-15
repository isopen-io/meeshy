package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import org.junit.Test

/**
 * #13598 : comme iOS (`ComposerMediaControls` : `objectId: isBackground ? nil : media.id`), le filtre du média de FOND
 * est celui de la slide, avec son intensité. Un autre média n'est ni peint par le plateau ni publié comme objet par le
 * composeur Android : lui proposer un filtre serait proposer un effet perdu à la publication.
 */
class StoryMediaFilterTest {
    private val filterSection = ComposerObjectEditorSection.Media(MediaEditTool.FILTER)

    private fun media(id: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun state(vararg ids: String): StoryComposerUiState {
        val deck = ids.fold(StorySlideDeck.single("s")) { acc, id -> acc.addMediaToSelected(id) }
        return StoryComposerUiState(deck = deck, attachments = ids.map(::media)).mirrorDraftToSelection()
    }

    @Test
    fun `le media que le plateau peint offre le filtre de la scene`() {
        assertThat(state("a", "b").mediaSectionsFor("a")).contains(filterSection)
    }

    @Test
    fun `un media que ni le plateau ni la publication ne montrent n offre aucun filtre`() {
        val sections = state("a", "b").mediaSectionsFor("b")
        assertThat(sections).doesNotContain(filterSection)
        assertThat(sections).isNotEmpty()
    }

    @Test
    fun `le fond designe offre le filtre de la scene, il est celui que le lecteur colore`() {
        val base = state("a", "b")
        val designated = StoryComposerBackgroundReducer.backgroundMediaToggled(base, "b")
        assertThat(designated.mediaSectionsFor("b")).contains(filterSection)
    }

    @Test
    fun `la section ouverte d un media sans filtre ne retombe jamais sur le filtre`() {
        val base = state("a", "b")
        val selected = StoryComposerSelectionReducer.mediaSelected(base, "b").copy(openObjectSection = filterSection)
        assertThat(selected.openMediaSection).isNotEqualTo(filterSection)
    }

    @Test
    fun `choisir le filtre du media de fond pose le filtre de la scene, que le plateau peint`() {
        val next = StoryComposerBackgroundReducer.filterSelected(state("a"), StoryFilter.BW)
        assertThat(next.deck.selectedSlide.filter).isEqualTo(StoryFilter.BW)
        assertThat(next.selectedSlideFilter).isEqualTo(StoryFilter.BW)
    }

    @Test
    fun `le fond publie ne porte aucun filtre d objet, celui de la scene voyage sur les effets comme iOS`() {
        val request = StoryComposerDraft(
            mediaIds = listOf("m1"),
            filter = StoryFilter.WARM,
            backgroundMedia = StoryBackgroundMedia("m1", "https://cdn/m1.jpg", "image/jpeg", null),
        ).toCreateStoryRequest("en")
        assertThat(request.storyEffects?.filter).isEqualTo("warm")
        assertThat(request.storyEffects?.mediaObjects?.single()?.filter).isNull()
    }
}
