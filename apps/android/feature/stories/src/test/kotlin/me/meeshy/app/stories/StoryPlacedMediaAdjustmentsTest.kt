package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryDraftPlacedMediaSnapshot
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.scene.SceneLookParams
import me.meeshy.sdk.model.scene.SceneLookRecipe
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13599 : comme iOS (`StoryMediaObject.adjustments`, sous-outils Réglages et Effets), un média de premier plan règle SES
 * curseurs, sans jamais toucher à ceux d'un autre média ni de la scène ; ils partent en `mediaObjects[].adjustments`,
 * le brouillon les garde, le lecteur les lit. Absent ⇒ rien de réglé (ancien brouillon, ancienne story).
 */
@RunWith(JUnit4::class)
class StoryPlacedMediaAdjustmentsTest {
    private val adjustSection = ComposerObjectEditorSection.Media(MediaEditTool.ADJUST)
    private val effectsSection = ComposerObjectEditorSection.Media(MediaEditTool.EFFECTS)

    private fun media(id: String, mime: String = "image/jpeg") =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun state(vararg placed: StoryPlacedMedia, background: String? = null, mimes: Map<String, String> = emptyMap()): StoryComposerUiState {
        val ids = (listOfNotNull(background) + placed.map { it.mediaId }).distinct()
        val slide = StorySlide(id = "s", mediaIds = ids, backgroundMediaId = background, placedMedia = placed.toList())
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = ids.map { media(it, mimes[it] ?: "image/jpeg") })
    }

    private val tuned = ImageAdjustments().with(AdjustmentKind.BRIGHTNESS, 0.2f).with(AdjustmentKind.GRAIN, 0.5f)

    @Test
    fun `regler un curseur d un media pose ne touche ni les autres medias ni la scene`() {
        val base = state(StoryPlacedMedia("m1"), StoryPlacedMedia("m2"), background = "bg")

        val next = StoryComposerPlacedMediaReducer.adjusted(base, "m1", AdjustmentKind.CONTRAST, 1.3f)

        val placed = next.deck.selectedSlide.placedMedia
        assertThat(placed.first { it.mediaId == "m1" }.adjustments!![AdjustmentKind.CONTRAST]).isEqualTo(1.3f)
        assertThat(placed.first { it.mediaId == "m2" }.adjustments).isNull()
        assertThat(next.deck.selectedSlide.filter).isNull()
    }

    @Test
    fun `un curseur hors course est borne, le neutre l efface et un sac neutre disparait`() {
        val base = state(StoryPlacedMedia("m1"))

        val high = StoryComposerPlacedMediaReducer.adjusted(base, "m1", AdjustmentKind.BLUR, 9f)
        assertThat(high.placedAdjustmentsOf("m1")!![AdjustmentKind.BLUR]).isEqualTo(1f)

        val back = StoryComposerPlacedMediaReducer.adjusted(high, "m1", AdjustmentKind.BLUR, 0f)
        assertThat(back.placedAdjustmentsOf("m1")).isNull()
    }

    @Test
    fun `regler un media non pose ou a la meme valeur est inerte`() {
        val base = state(StoryPlacedMedia("m1", adjustments = tuned))

        assertThat(StoryComposerPlacedMediaReducer.adjusted(base, "ghost", AdjustmentKind.CONTRAST, 1.2f)).isSameInstanceAs(base)
        assertThat(StoryComposerPlacedMediaReducer.adjusted(base, "m1", AdjustmentKind.BRIGHTNESS, 0.2f)).isSameInstanceAs(base)
        assertThat(StoryComposerPlacedMediaReducer.adjustmentsReset(base, "ghost", AdjustmentFamily.TONE)).isSameInstanceAs(base)
    }

    @Test
    fun `reinitialiser un sous-outil laisse l autre intact`() {
        val base = state(StoryPlacedMedia("m1", adjustments = tuned))

        val tone = StoryComposerPlacedMediaReducer.adjustmentsReset(base, "m1", AdjustmentFamily.TONE).placedAdjustmentsOf("m1")!!
        assertThat(tone[AdjustmentKind.BRIGHTNESS]).isEqualTo(0f)
        assertThat(tone[AdjustmentKind.GRAIN]).isEqualTo(0.5f)

        val none = StoryComposerPlacedMediaReducer.adjustmentsReset(
            StoryComposerPlacedMediaReducer.adjustmentsReset(base, "m1", AdjustmentFamily.TONE), "m1", AdjustmentFamily.EFFECT,
        )
        assertThat(none.placedAdjustmentsOf("m1")).isNull()
    }

    @Test
    fun `la publication porte les reglages du media pose`() {
        val state = state(StoryPlacedMedia("m1", adjustments = tuned))

        val obj = StoryPublishPlacedMedia.resolve(state.deck.selectedSlide, state).single()

        assertThat(obj.adjustments).isEqualTo(tuned)
        assertThat(obj.isBackground).isFalse()
    }

    @Test
    fun `un media encore en attente d envoi garde ses reglages sur la ligne d outbox`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("cmid"), placedMedia = listOf(StoryPlacedMedia("cmid", adjustments = tuned)))
        val state = StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            pendingUploads = listOf(PendingMediaUpload("cmid", MediaUploadItem(ByteArray(1), "a.jpg", "image/jpeg"))),
        )

        assertThat(StoryPublishPlacedMedia.resolve(slide, state).single().adjustments).isEqualTo(tuned)
    }

    @Test
    fun `sans reglage rien ne part au fil`() {
        assertThat(StoryPlacedMedia("m1").toMediaObject("https://x/m1.jpg", "image/jpeg", null).adjustments).isNull()
        assertThat(StoryPlacedMedia("m1", adjustments = ImageAdjustments()).toMediaObject("https://x/m1.jpg", "image/jpeg", null).adjustments).isNull()
    }

    @Test
    fun `les reglages survivent a l aller retour du brouillon`() {
        val deck = StorySlideDeck(
            listOf(StorySlide(id = "s", mediaIds = listOf("m1"), placedMedia = listOf(StoryPlacedMedia("m1", filter = StoryFilter.WARM, adjustments = tuned)))),
            "s",
        )
        val json = Json { ignoreUnknownKeys = true }
        val snapshot = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-29T00:00:00Z")

        val wire = json.encodeToString(me.meeshy.sdk.model.StoryComposerDraftSnapshot.serializer(), snapshot)
        val back = json.decodeFromString(me.meeshy.sdk.model.StoryComposerDraftSnapshot.serializer(), wire).toDeck()!!

        val placed = back.slides.single().placedMedia.single()
        assertThat(placed.adjustments).isEqualTo(tuned)
        assertThat(placed.filter).isEqualTo(StoryFilter.WARM)
    }

    @Test
    fun `un ancien brouillon sans reglages se lit sans reglages`() {
        val old = Json { ignoreUnknownKeys = true }.decodeFromString<StoryDraftPlacedMediaSnapshot>("""{"id":"m1","x":0.2,"filter":"bw"}""")

        assertThat(old.adjustments).isNull()
        assertThat(StoryPlacedMedia.from(old).adjustments).isNull()
    }

    @Test
    fun `un brouillon plus recent aux cles inconnues se lit sans elles, valeurs bornees`() {
        val raw = """{"id":"m1","adjustments":{"contrast":9,"halo":0.3,"blur":"x"}}"""

        val placed = StoryPlacedMedia.from(Json { ignoreUnknownKeys = true }.decodeFromString<StoryDraftPlacedMediaSnapshot>(raw))

        assertThat(placed.adjustments!![AdjustmentKind.CONTRAST]).isEqualTo(1.5f)
        assertThat(placed.adjustments!!.activeCount).isEqualTo(1)
    }

    @Test
    fun `un media de premier plan publie par iOS garde ses reglages`() {
        val ios = StoryMediaObject(id = "o", postMediaId = "m1", adjustments = tuned)

        assertThat(StoryPlacedMedia.foreground(listOf(ios)).single().adjustments).isEqualTo(tuned)
        assertThat(StoryPlacedMedia.foreground(listOf(StoryMediaObject(id = "o", postMediaId = "m1"))).single().adjustments).isNull()
    }

    @Test
    fun `le lecteur colore le media avec ses reglages, pas ceux d un autre`() {
        val wire = StoryPlacedMedia("m1", adjustments = tuned).toMediaObject("https://x/m1.jpg", "image/jpeg", null)

        val recipe = SceneLookRecipe.forMedia(wire)

        assertThat(recipe.params).isEqualTo(SceneLookParams.from(tuned))
        assertThat(recipe.params.brightness).isEqualTo(0.2f)
        assertThat(SceneLookRecipe.forMedia(StoryPlacedMedia("m2").toMediaObject("https://x/m2.jpg", "image/jpeg", null)).isNeutral).isTrue()
    }

    @Test
    fun `un media pose offre Reglages et Effets, le fond et un media non pose non`() {
        val s = state(StoryPlacedMedia("m1"), background = "bg")

        assertThat(s.mediaSectionsFor("m1")).containsAtLeast(adjustSection, effectsSection)
        assertThat(s.mediaSectionsFor("bg")).containsNoneOf(adjustSection, effectsSection)
    }

    @Test
    fun `une video posee offre les Reglages mais pas les Effets`() {
        val s = state(StoryPlacedMedia("v1"), mimes = mapOf("v1" to "video/mp4"))

        assertThat(s.mediaSectionsFor("v1")).contains(adjustSection)
        assertThat(s.mediaSectionsFor("v1")).doesNotContain(effectsSection)
    }

    @Test
    fun `les reglages affiches d un media pose sont les siens`() {
        val s = state(StoryPlacedMedia("m1", adjustments = tuned), StoryPlacedMedia("m2"))

        assertThat(s.placedAdjustmentsOf("m1")).isEqualTo(tuned)
        assertThat(s.placedAdjustmentsOf("m2")).isNull()
        assertThat(s.placedAdjustmentsOf("ghost")).isNull()
    }

    @Test
    fun `le plateau peint le media pose avec ses reglages, neutre sans`() {
        val s = state(StoryPlacedMedia("m1", adjustments = tuned), StoryPlacedMedia("m2"))

        val frames = s.placedMediaFrames().associateBy { it.key }

        assertThat(frames.getValue("m1").look.params.brightness).isEqualTo(0.2f)
        assertThat(frames.getValue("m2").look.isNeutral).isTrue()
    }

    @Test
    fun `le plateau ne paie pas les effets a une video posee`() {
        val s = state(StoryPlacedMedia("v1", adjustments = tuned), mimes = mapOf("v1" to "video/mp4"))

        val look = s.placedMediaFrames().single().look

        assertThat(look.params.brightness).isEqualTo(0.2f)
        assertThat(look.params.grain).isEqualTo(0f)
    }
}
