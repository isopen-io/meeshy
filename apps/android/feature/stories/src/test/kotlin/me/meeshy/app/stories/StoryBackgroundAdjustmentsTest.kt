package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.scene.SceneLookParams
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13652 : comme iOS (`StoryMediaObject.adjustments` d'un objet `isBackground`, sous-outils Réglages et Effets du fond),
 * le média de FOND règle SES curseurs, sans toucher à ceux d'un média posé ni au filtre de la scène ; ils partent dans
 * `mediaObjects[]` (le fond), le brouillon les garde, le lecteur les lit. Absent ⇒ rien de réglé (ancien brouillon).
 */
@RunWith(JUnit4::class)
class StoryBackgroundAdjustmentsTest {
    private val adjustSection = ComposerObjectEditorSection.Media(MediaEditTool.ADJUST)
    private val effectsSection = ComposerObjectEditorSection.Media(MediaEditTool.EFFECTS)
    private val tuned = ImageAdjustments().with(AdjustmentKind.BRIGHTNESS, 0.2f).with(AdjustmentKind.GRAIN, 0.5f)

    private fun media(id: String, mime: String = "image/jpeg") =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun state(
        background: String? = "bg",
        others: List<String> = emptyList(),
        placed: List<StoryPlacedMedia> = emptyList(),
        adjustments: ImageAdjustments? = null,
        filter: StoryFilter? = null,
        mimes: Map<String, String> = emptyMap(),
    ): StoryComposerUiState {
        val ids = (listOfNotNull(background) + others + placed.map { it.mediaId }).distinct()
        val slide = StorySlide(
            id = "s", mediaIds = ids, backgroundMediaId = background, placedMedia = placed,
            backgroundAdjustments = adjustments, filter = filter,
        )
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = ids.map { media(it, mimes[it] ?: "image/jpeg") })
    }

    private fun StoryComposerUiState.slide() = deck.selectedSlide

    @Test
    fun `regler un curseur du fond ne touche ni les medias poses ni le filtre de la scene`() {
        val base = state(placed = listOf(StoryPlacedMedia("m1")), filter = StoryFilter.WARM)

        val next = StoryComposerAdjustReducer.adjusted(base, "bg", AdjustmentKind.CONTRAST, 1.3f)

        assertThat(next.slide().backgroundAdjustments!![AdjustmentKind.CONTRAST]).isEqualTo(1.3f)
        assertThat(next.slide().placedMedia.single().adjustments).isNull()
        assertThat(next.slide().filter).isEqualTo(StoryFilter.WARM)
    }

    @Test
    fun `regler un media pose ne touche pas les reglages du fond`() {
        val base = state(placed = listOf(StoryPlacedMedia("m1")), adjustments = tuned)

        val next = StoryComposerAdjustReducer.adjusted(base, "m1", AdjustmentKind.CONTRAST, 1.3f)

        assertThat(next.slide().placedMedia.single().adjustments!![AdjustmentKind.CONTRAST]).isEqualTo(1.3f)
        assertThat(next.slide().backgroundAdjustments).isEqualTo(tuned)
    }

    @Test
    fun `un curseur hors course est borne, le neutre l efface et un sac neutre disparait`() {
        val high = StoryComposerAdjustReducer.adjusted(state(), "bg", AdjustmentKind.BLUR, 9f)
        assertThat(high.slide().backgroundAdjustments!![AdjustmentKind.BLUR]).isEqualTo(1f)

        val back = StoryComposerAdjustReducer.adjusted(high, "bg", AdjustmentKind.BLUR, 0f)
        assertThat(back.slide().backgroundAdjustments).isNull()
    }

    @Test
    fun `regler un media inconnu ou a la meme valeur est inerte`() {
        val base = state(adjustments = tuned)

        assertThat(StoryComposerAdjustReducer.adjusted(base, "ghost", AdjustmentKind.CONTRAST, 1.2f)).isSameInstanceAs(base)
        assertThat(StoryComposerAdjustReducer.adjusted(base, "bg", AdjustmentKind.BRIGHTNESS, 0.2f)).isSameInstanceAs(base)
        assertThat(StoryComposerAdjustReducer.reset(base, "ghost", AdjustmentFamily.TONE)).isSameInstanceAs(base)
    }

    @Test
    fun `reinitialiser un sous-outil du fond laisse l autre intact`() {
        val base = state(adjustments = tuned)

        val tone = StoryComposerAdjustReducer.reset(base, "bg", AdjustmentFamily.TONE).slide().backgroundAdjustments!!
        assertThat(tone[AdjustmentKind.BRIGHTNESS]).isEqualTo(0f)
        assertThat(tone[AdjustmentKind.GRAIN]).isEqualTo(0.5f)

        val none = StoryComposerAdjustReducer.reset(
            StoryComposerAdjustReducer.reset(base, "bg", AdjustmentFamily.TONE), "bg", AdjustmentFamily.EFFECT,
        )
        assertThat(none.slide().backgroundAdjustments).isNull()
    }

    @Test
    fun `regler le premier media d une scene sans fond designe le designe comme fond`() {
        val base = state(background = null, others = listOf("first", "second"))

        val next = StoryComposerAdjustReducer.adjusted(base, "first", AdjustmentKind.SATURATION, 1.5f)

        assertThat(next.slide().backgroundMediaId).isEqualTo("first")
        assertThat(next.slide().backgroundAdjustments!![AdjustmentKind.SATURATION]).isEqualTo(1.5f)
        assertThat(StoryComposerAdjustReducer.adjusted(base, "second", AdjustmentKind.SATURATION, 1.5f)).isSameInstanceAs(base)
    }

    @Test
    fun `changer ou retirer le fond lui retire ses reglages, ils ne passent pas a un autre media`() {
        val base = state(others = listOf("other"), adjustments = tuned)

        assertThat(StoryComposerBackgroundReducer.backgroundMediaToggled(base, "other").slide().backgroundAdjustments).isNull()
        assertThat(StoryComposerBackgroundReducer.backgroundMediaToggled(base, "bg").slide().backgroundAdjustments).isNull()
        assertThat(base.deck.removeMedia("bg").selectedSlide.backgroundAdjustments).isNull()
        assertThat(base.deck.removeMedia("other").selectedSlide.backgroundAdjustments).isEqualTo(tuned)
    }

    @Test
    fun `les reglages affiches sont ceux du media touche, fond ou pose`() {
        val s = state(placed = listOf(StoryPlacedMedia("m1", adjustments = ImageAdjustments().with(AdjustmentKind.VIBRANCE, 0.3f))), adjustments = tuned)

        assertThat(s.adjustmentsOf("bg")).isEqualTo(tuned)
        assertThat(s.adjustmentsOf("m1")!![AdjustmentKind.VIBRANCE]).isEqualTo(0.3f)
        assertThat(s.adjustmentsOf("ghost")).isNull()
    }

    @Test
    fun `la publication porte les reglages du fond sur son objet isBackground`() {
        val s = state(adjustments = tuned)

        val obj = StoryPublishBackground.resolve(s.slide(), s)!!.toMediaObject()

        assertThat(obj.isBackground).isTrue()
        assertThat(obj.adjustments).isEqualTo(tuned)
        val published = publishPlans(s, "fr").single().request.storyEffects!!.mediaObjects!!.single { it.isBackground }
        assertThat(published.adjustments).isEqualTo(tuned)
    }

    @Test
    fun `sans reglage rien ne part au fil, et une video ne publie que les reglages qu elle peint`() {
        val plain = state()
        assertThat(StoryPublishBackground.resolve(plain.slide(), plain)!!.toMediaObject().adjustments).isNull()

        val video = state(adjustments = tuned.with(AdjustmentKind.BLUR, 0.5f).with(AdjustmentKind.CONTRAST, 1.2f), mimes = mapOf("bg" to "video/mp4"))
        val wire = StoryPublishBackground.resolve(video.slide(), video)!!.toMediaObject().adjustments!!
        assertThat(wire[AdjustmentKind.CONTRAST]).isEqualTo(1.2f)
        assertThat(wire[AdjustmentKind.BRIGHTNESS]).isEqualTo(0.2f)
        assertThat(wire[AdjustmentKind.BLUR]).isEqualTo(0f)
        assertThat(wire[AdjustmentKind.GRAIN]).isEqualTo(0f)
    }

    @Test
    fun `un fond encore en attente d envoi garde ses reglages sur la ligne d outbox`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("cmid"), backgroundMediaId = "cmid", backgroundAdjustments = tuned)
        val s = StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            pendingUploads = listOf(PendingMediaUpload("cmid", MediaUploadItem(ByteArray(1), "a.jpg", "image/jpeg"))),
        )

        assertThat(StoryPublishBackground.resolve(slide, s)!!.toMediaObject().adjustments).isEqualTo(tuned)
    }

    @Test
    fun `les reglages du fond survivent a l aller retour du brouillon`() {
        val deck = state(adjustments = tuned).deck
        val json = Json { ignoreUnknownKeys = true }
        val snapshot = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-29T00:00:00Z")

        val wire = json.encodeToString(StoryComposerDraftSnapshot.serializer(), snapshot)
        val back = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), wire).toDeck()!!

        assertThat(back.slides.single().backgroundAdjustments).isEqualTo(tuned)
    }

    @Test
    fun `un ancien brouillon sans reglages de fond se lit sans reglages`() {
        val old = Json { ignoreUnknownKeys = true }.decodeFromString<StoryDraftSlideSnapshot>("""{"id":"s","backgroundMediaId":"bg"}""")

        assertThat(old.backgroundAdjustments).isNull()
    }

    @Test
    fun `le fond offre Filtre, Reglages et Effets, une video sans les Effets`() {
        val image = state()
        assertThat(image.mediaSectionsFor("bg")).containsAtLeast(ComposerObjectEditorSection.Media(MediaEditTool.FILTER), adjustSection, effectsSection)

        val video = state(mimes = mapOf("bg" to "video/mp4"))
        assertThat(video.mediaSectionsFor("bg")).contains(adjustSection)
        assertThat(video.mediaSectionsFor("bg")).doesNotContain(effectsSection)
    }

    @Test
    fun `le premier media d une scene sans fond designe offre Reglages et Effets, un autre media non pose non`() {
        val s = state(background = null, others = listOf("first", "second"))

        assertThat(s.mediaSectionsFor("first")).containsAtLeast(adjustSection, effectsSection)
        assertThat(s.mediaSectionsFor("second")).containsNoneOf(adjustSection, effectsSection)
    }

    @Test
    fun `le plateau peint le fond avec le filtre de la scene puis ses reglages`() {
        val s = state(adjustments = tuned, filter = StoryFilter.WARM)

        val look = s.selectedSlideLook(comparing = null)

        assertThat(look.params).isEqualTo(SceneLookParams.from(tuned))
        assertThat(look.filterMatrix).isEqualTo(s.selectedSlideFilterMatrix)
        assertThat(state().selectedSlideLook(comparing = null).isNeutral).isTrue()
    }

    @Test
    fun `une video de fond n est pas peinte avec ce qu elle ne sert pas`() {
        val s = state(adjustments = tuned, mimes = mapOf("bg" to "video/mp4"))

        val look = s.selectedSlideLook(comparing = null)

        assertThat(look.params.brightness).isEqualTo(0.2f)
        assertThat(look.params.grain).isEqualTo(0f)
    }

    @Test
    fun `comparer le fond montre son original, sans reglages et sans le filtre de la scene`() {
        val s = state(adjustments = tuned, filter = StoryFilter.WARM)

        assertThat(s.selectedSlideLook(comparing = "bg").isNeutral).isTrue()
        assertThat(s.selectedSlideLook(comparing = "m1").params).isEqualTo(SceneLookParams.from(tuned))
    }

    @Test
    fun `comparer un media pose montre son original et lui seul`() {
        val s = state(placed = listOf(StoryPlacedMedia("m1", filter = StoryFilter.WARM, adjustments = tuned), StoryPlacedMedia("m2", adjustments = tuned)), adjustments = tuned)

        val frames = s.placedMediaFrames(mediaBaseUrl = null, comparing = "m1").associateBy { it.key }

        assertThat(frames.getValue("m1").look.isNeutral).isTrue()
        assertThat(frames.getValue("m2").look.params.brightness).isEqualTo(0.2f)
        assertThat(s.selectedSlideLook(comparing = "m1").params.brightness).isEqualTo(0.2f)
    }

    @Test
    fun `Comparer ne se peint que si le media porte un rendu a comparer`() {
        val s = state(placed = listOf(StoryPlacedMedia("m1"), StoryPlacedMedia("m2", filter = StoryFilter.WARM), StoryPlacedMedia("m3", adjustments = tuned)))

        assertThat(s.carriesLook("m1")).isFalse()
        assertThat(s.carriesLook("m2")).isTrue()
        assertThat(s.carriesLook("m3")).isTrue()
        assertThat(s.carriesLook("bg")).isFalse()
        assertThat(state(adjustments = tuned).carriesLook("bg")).isTrue()
        assertThat(state(filter = StoryFilter.WARM).carriesLook("bg")).isTrue()
        assertThat(s.carriesLook("ghost")).isFalse()
    }

    @Test
    fun `le lecteur lit les reglages du fond publie par Android comme ceux d iOS`() {
        val s = state(adjustments = tuned, filter = StoryFilter.WARM)
        val effects = publishPlans(s, "fr").single().request.storyEffects

        val recipe = SceneLookRecipe.forEffects(effects)

        assertThat(recipe.params).isEqualTo(SceneLookParams.from(tuned))
    }

    private val contrasted = ImageAdjustments().with(AdjustmentKind.CONTRAST, 1.3f)

    @Test
    fun `un fond regle sur iOS rouvre ses reglages dans le composeur`() {
        val ios = StoryEditFixtures.iosPost
        val effects = ios.storyEffects!!
        val adjusted = ios.copy(storyEffects = effects.copy(mediaObjects = effects.mediaObjects!!.map { if (it.isBackground) it.copy(adjustments = contrasted) else it }))

        val opening = StoryEditFixtures.opening(adjusted)

        assertThat(opening.slide.backgroundAdjustments).isEqualTo(contrasted)
        assertThat(StoryEditFixtures.opening().slide.backgroundAdjustments).isNull()
    }

    @Test
    fun `regler le fond d une story rouverte part sur l objet de fond qui garde le reste d iOS`() {
        val opening = StoryEditFixtures.opening()
        val opened = StoryEditFixtures.opened(opening)
        val slide = opened.deck.selectedSlide.copy(backgroundAdjustments = contrasted)
        val state = opened.copy(deck = StorySlideDeck(listOf(slide), slide.id)).mirrorDraftToSelection()

        val background = (StoryEditMerge.plan(opening, state, "fr") as StoryEditPlan.Ready).optimistic.storyEffects!!.mediaObjects!!.first { it.isBackground }

        assertThat(background.adjustments).isEqualTo(contrasted)
        assertThat(background.x).isEqualTo(0.4)
        assertThat(background.y).isEqualTo(0.6)
        assertThat(background.scale).isEqualTo(0.9)
        assertThat(background.keyframes).isNotNull()
        assertThat(background.crop).isEqualTo(opening.effects.mediaObjects!!.first { it.isBackground }.crop)
    }

    @Test
    fun `rouvrir puis enregistrer sans geste ne touche pas aux reglages du fond`() {
        val ios = StoryEditFixtures.iosPost
        val effects = ios.storyEffects!!
        val adjusted = ios.copy(storyEffects = effects.copy(mediaObjects = effects.mediaObjects!!.map { if (it.isBackground) it.copy(adjustments = contrasted) else it }))
        val opening = StoryEditFixtures.opening(adjusted)
        val opened = StoryEditFixtures.opened(opening)

        val merged = StoryEditMerge.effects(opening, opened.deck.selectedSlide, publishPlans(opened, "fr").single().request.storyEffects)

        assertThat(merged).isEqualTo(opening.effects)
    }

    private fun reopenedBackground(change: (StorySlide) -> StorySlide): StoryMediaObject {
        val opening = StoryEditFixtures.opening()
        val opened = StoryEditFixtures.opened(opening)
        val slide = change(opened.deck.selectedSlide)
        val state = opened.copy(deck = StorySlideDeck(listOf(slide), slide.id)).mirrorDraftToSelection()
        return (StoryEditMerge.plan(opening, state, "fr") as StoryEditPlan.Ready).optimistic.storyEffects!!.mediaObjects!!.first { it.isBackground }
    }

    @Test
    fun `monter la luminosite du fond d une story iOS rouverte ecrit les reglages et garde son cadrage`() {
        val brighter = ImageAdjustments().with(AdjustmentKind.BRIGHTNESS, 0.2f)

        val background = reopenedBackground { it.copy(backgroundAdjustments = brighter) }

        assertThat(background.adjustments).isEqualTo(brighter)
        assertThat(background.x).isEqualTo(0.4)
        assertThat(background.y).isEqualTo(0.6)
        assertThat(background.scale).isEqualTo(0.9)
        assertThat(background.loop).isTrue()
    }

    @Test
    fun `basculer la boucle du fond d une video rouverte garde son cadrage et ses reglages`() {
        val background = reopenedBackground { it.copy(backgroundLoop = !it.backgroundLoop) }

        assertThat(background.loop).isFalse()
        assertThat(background.x).isEqualTo(0.4)
        assertThat(background.y).isEqualTo(0.6)
        assertThat(background.scale).isEqualTo(0.9)
        assertThat(background.adjustments).isNull()
    }

    @Test
    fun `un vrai changement de cadrage du fond rouvert est ecrit, sans toucher la boucle ni les reglages`() {
        val background = reopenedBackground { it.copy(transform = StoryCanvasTransform(scale = 2f)) }

        assertThat(background.scale).isEqualTo(2.0)
        assertThat(background.x).isNotEqualTo(0.4)
        assertThat(background.loop).isTrue()
        assertThat(background.adjustments).isNull()
    }
}
