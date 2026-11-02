package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.StoryDraftPlacedMediaSnapshot
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.StoryFilterMatrix
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13603 : comme iOS (`StoryMediaObject.filter`, `applyMediaObjectFilter`), un média de premier plan règle SON filtre,
 * à pleine force, sans jamais toucher à celui de la scène ; il part en `mediaObjects[].filter`, le brouillon le garde, le
 * lecteur le lit. Absent ⇒ aucun filtre (ancien brouillon, ancienne story).
 */
@RunWith(JUnit4::class)
class StoryPlacedMediaFilterTest {
    private val filterSection = ComposerObjectEditorSection.Media(MediaEditTool.FILTER)

    private fun media(id: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun state(vararg placed: StoryPlacedMedia, background: String? = null): StoryComposerUiState {
        val ids = (listOfNotNull(background) + placed.map { it.mediaId }).distinct()
        val slide = StorySlide(id = "s", mediaIds = ids, backgroundMediaId = background, placedMedia = placed.toList())
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = ids.map(::media))
    }

    @Test
    fun `la publication porte le filtre propre du media pose`() {
        val state = state(StoryPlacedMedia("m1", filter = StoryFilter.VIVID))

        val obj = StoryPublishPlacedMedia.resolve(state.deck.selectedSlide, state).single()

        assertThat(obj.filter).isEqualTo("vivid")
        assertThat(obj.isBackground).isFalse()
    }

    @Test
    fun `un media encore en attente d envoi garde son filtre sur la ligne d outbox`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("cmid"), placedMedia = listOf(StoryPlacedMedia("cmid", filter = StoryFilter.WARM)))
        val state = StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            pendingUploads = listOf(PendingMediaUpload("cmid", MediaUploadItem(ByteArray(1), "a.jpg", "image/jpeg"))),
        )

        assertThat(StoryPublishPlacedMedia.resolve(slide, state).single().filter).isEqualTo("warm")
    }

    @Test
    fun `sans filtre rien ne part au fil`() {
        val obj = StoryPlacedMedia("m1").toMediaObject("https://x/m1.jpg", "image/jpeg", null)

        assertThat(obj.filter).isNull()
    }

    @Test
    fun `choisir le filtre d un media pose ne touche ni la scene ni les autres medias`() {
        val base = state(StoryPlacedMedia("m1"), StoryPlacedMedia("m2"), background = "bg")

        val next = StoryComposerPlacedMediaReducer.filtered(base, "m1", StoryFilter.BW)

        val placed = next.deck.selectedSlide.placedMedia
        assertThat(placed.first { it.mediaId == "m1" }.filter).isEqualTo(StoryFilter.BW)
        assertThat(placed.first { it.mediaId == "m2" }.filter).isNull()
        assertThat(next.deck.selectedSlide.filter).isNull()
        assertThat(StoryComposerPlacedMediaReducer.filtered(next, "m1", null).deck.selectedSlide.placedMedia.first().filter).isNull()
    }

    @Test
    fun `filtrer un media non pose ou identique est inerte`() {
        val base = state(StoryPlacedMedia("m1", filter = StoryFilter.BW))

        assertThat(StoryComposerPlacedMediaReducer.filtered(base, "ghost", StoryFilter.BW)).isSameInstanceAs(base)
        assertThat(StoryComposerPlacedMediaReducer.filtered(base, "m1", StoryFilter.BW)).isSameInstanceAs(base)
    }

    @Test
    fun `le filtre survit a l aller retour du brouillon`() {
        val deck = StorySlideDeck(
            listOf(StorySlide(id = "s", mediaIds = listOf("m1"), placedMedia = listOf(StoryPlacedMedia("m1", filter = StoryFilter.VIVID)))),
            "s",
        )

        val back = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-29T00:00:00Z").toDeck()!!

        assertThat(back.slides.single().placedMedia.single().filter).isEqualTo(StoryFilter.VIVID)
    }

    @Test
    fun `un ancien brouillon sans filtre se lit sans filtre`() {
        val old = Json { ignoreUnknownKeys = true }.decodeFromString<StoryDraftPlacedMediaSnapshot>("""{"id":"m1","x":0.2}""")

        assertThat(old.filter).isNull()
        assertThat(StoryPlacedMedia.from(old).filter).isNull()
    }

    @Test
    fun `un filtre inconnu d un brouillon plus recent se lit sans filtre`() {
        assertThat(StoryPlacedMedia.from(StoryDraftPlacedMediaSnapshot(id = "m1", filter = "futur")).filter).isNull()
    }

    @Test
    fun `un media de premier plan publie par iOS garde son filtre`() {
        val placed = StoryPlacedMedia.foreground(listOf(StoryMediaObject(id = "o", postMediaId = "m1", filter = "bw")))

        assertThat(placed.single().filter).isEqualTo(StoryFilter.BW)
    }

    @Test
    fun `le lecteur colore le media avec le filtre publie, pas celui de la scene`() {
        val wire = StoryPlacedMedia("m1", filter = StoryFilter.BW).toMediaObject("https://x/m1.jpg", "image/jpeg", null)

        val recipe = SceneLookRecipe.forMedia(wire)

        assertThat(recipe.filterMatrix).isEqualTo(StoryFilterMatrix.effectiveMatrix(StoryFilter.BW, 1f))
    }

    @Test
    fun `un media pose offre son filtre, meme s il n est pas le fond de la scene`() {
        val s = state(StoryPlacedMedia("m1"), background = "bg")

        assertThat(s.mediaSectionsFor("m1")).contains(filterSection)
        assertThat(s.mediaSectionsFor("bg")).contains(filterSection)
    }

    @Test
    fun `le filtre affiche d un media pose est le sien, la scene garde le sien`() {
        val s = state(StoryPlacedMedia("m1", filter = StoryFilter.BW), background = "bg")
            .let { StoryComposerBackgroundReducer.filterSelected(it, StoryFilter.WARM) }

        assertThat(s.placedFilterOf("m1")).isEqualTo(StoryFilter.BW)
        assertThat(s.placedFilterOf("bg")).isNull()
        assertThat(s.selectedSlideFilter).isEqualTo(StoryFilter.WARM)
    }

    @Test
    fun `le plateau peint le media pose avec son filtre propre, neutre sans filtre`() {
        val s = state(StoryPlacedMedia("m1", filter = StoryFilter.BW), StoryPlacedMedia("m2"))

        val frames = s.placedMediaFrames(mediaBaseUrl = null).associateBy { it.key }

        assertThat(frames.getValue("m1").look.filterMatrix).isEqualTo(StoryFilterMatrix.effectiveMatrix(StoryFilter.BW, 1f))
        assertThat(frames.getValue("m2").look.isNeutral).isTrue()
    }
}
