package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.look.ComposerLookStripItem
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13841 — tant que rien n'est publié, une image garde son filtre, son cadre et son effet de l'appel comme RÉGLAGES
 * (`StoryMediaLook`, format v1 d'iOS) : même identifiant, même fichier, couverts par l'historique, relus à la
 * réouverture et par le brouillon ; la cuisson n'a lieu qu'à la publication, et aucun look ne part au fil.
 */
@RunWith(JUnit4::class)
class StoryMediaLookEditingTest {
    private val lookSection = ComposerObjectEditorSection.Media(MediaEditTool.LOOK)
    private val warm = ComposerLookStripItem.Filter(VideoFilterPreset.Warm)
    private val polaroid = ComposerLookStripItem.Frame(ComposerPhotoFrame.Montage(CallMontageChoice.Classic(CallMontageStyle.POLAROID)))

    private fun media(id: String, mime: String = "image/jpeg") =
        UploadedMedia(id = id, url = "2026/10/$id/photo.jpg", mimeType = mime, fileSize = 1, width = 1080, height = 1920, durationMs = 8_000, thumbnailUrl = null)

    private fun state(placed: List<String> = listOf("m1"), background: String? = null, videos: Set<String> = emptySet()): StoryComposerUiState {
        val ids = (listOfNotNull(background) + placed).distinct()
        val slide = StorySlide(id = "s", mediaIds = ids, backgroundMediaId = background, placedMedia = placed.map { StoryPlacedMedia(it) })
        return StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            attachments = ids.map { media(it, if (it in videos) "video/mp4" else "image/jpeg") },
        )
    }

    @Test
    fun `choisir un filtre de l appel ecrit le look du media sans changer ni son identifiant ni son fichier`() {
        val before = state()

        val after = StoryComposerLookReducer.chosen(before, "m1", warm)

        assertThat(after.mediaLookOf("m1")).isEqualTo(StoryMediaLook(filterPreset = "warm"))
        assertThat(after.deck.selectedSlide.mediaIds).isEqualTo(before.deck.selectedSlide.mediaIds)
        assertThat(after.deck.selectedSlide.placedMedia.single().mediaId).isEqualTo("m1")
        assertThat(after.attachments).isEqualTo(before.attachments)
    }

    @Test
    fun `filtre et cadre se combinent, et aucun cadre efface le cadre seul`() {
        val both = StoryComposerLookReducer.chosen(StoryComposerLookReducer.chosen(state(), "m1", warm), "m1", polaroid)

        assertThat(both.mediaLookOf("m1")).isEqualTo(StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid"))
        val unframed = StoryComposerLookReducer.chosen(both, "m1", ComposerLookStripItem.Frame(ComposerPhotoFrame.None))
        assertThat(unframed.mediaLookOf("m1")).isEqualTo(StoryMediaLook(filterPreset = "warm"))
        val natural = StoryComposerLookReducer.chosen(unframed, "m1", ComposerLookStripItem.Filter(VideoFilterPreset.Natural))
        assertThat(natural.mediaLookOf("m1")).isNull()
        assertThat(natural.deck.selectedSlide.mediaLooks).isEmpty()
    }

    @Test
    fun `un choix identique ou un media absent de la diapo est inerte`() {
        val looked = StoryComposerLookReducer.chosen(state(), "m1", warm)

        assertThat(StoryComposerLookReducer.chosen(looked, "m1", warm)).isSameInstanceAs(looked)
        assertThat(StoryComposerLookReducer.chosen(looked, "ghost", warm)).isSameInstanceAs(looked)
    }

    @Test
    fun `filtres et cadres s offrent a une image posee ou de fond, pas a une video`() {
        val s = state(placed = listOf("m1", "v1"), background = "bg", videos = setOf("v1"))

        assertThat(s.mediaSectionsFor("m1")).contains(lookSection)
        assertThat(s.mediaSectionsFor("bg")).contains(lookSection)
        assertThat(s.mediaSectionsFor("v1")).doesNotContain(lookSection)
    }

    @Test
    fun `le fond garde son look, et le perd en cessant d etre dans la diapo`() {
        val looked = StoryComposerLookReducer.chosen(state(placed = emptyList(), background = "bg"), "bg", polaroid)

        assertThat(looked.backgroundMediaLook(comparing = null)).isEqualTo(StoryMediaLook(frameId = "classic:polaroid"))
        assertThat(looked.backgroundMediaLook(comparing = "bg")).isNull()
        assertThat(looked.copy(deck = looked.deck.removeMedia("bg")).deck.selectedSlide.mediaLooks).isEmpty()
    }

    @Test
    fun `le plateau peint le media pose avec son look, et l original pendant Comparer`() {
        val looked = StoryComposerLookReducer.chosen(state(placed = listOf("m1", "m2")), "m1", warm)

        val frames = looked.placedMediaFrames(mediaBaseUrl = null).associateBy { it.key }
        assertThat(frames.getValue("m1").mediaLook).isEqualTo(StoryMediaLook(filterPreset = "warm"))
        assertThat(frames.getValue("m2").mediaLook).isNull()
        assertThat(looked.placedMediaFrames(mediaBaseUrl = null, comparing = "m1").first { it.key == "m1" }.mediaLook).isNull()
    }

    @Test
    fun `annuler retire le look, retablir le rend`() {
        val before = StoryComposerTextReducer.added(state(), "t1")
        val after = StoryComposerLookReducer.chosen(before, "m1", polaroid)
        val history = ComposerHistory(before.snapshot()).recorded(after.snapshot())

        val (undoneHistory, undone) = history.undone()!!
        assertThat(undone.deck.selectedSlide.mediaLooks).isEmpty()
        assertThat(undoneHistory.redone()!!.second.deck.selectedSlide.mediaLooks["m1"]).isEqualTo(StoryMediaLook(frameId = "classic:polaroid"))
    }

    /**
     * Le critère de fin de #13841 : poser un texte et un sticker, ouvrir « Modifier » du média, changer son filtre et son
     * cadre, revenir. Le texte se déplace toujours, on ajoute un son, puis on rouvre « Modifier » et l'on retrouve le
     * filtre et le cadre choisis — et un brouillon rouvert les garde.
     */
    @Test
    fun `apres filtre et cadre, le texte bouge, un son se pose, et Modifier rouvert retrouve filtre et cadre`() {
        val placed = StoryComposerStickerReducer.added(StoryComposerTextReducer.added(state(), "t1"), "🎉", "k1")
        val editing = StoryComposerTrailingReducer.sectionOpened(StoryComposerSelectionReducer.mediaSelected(placed, "m1"), lookSection)
        assertThat(editing.openMediaSection).isEqualTo(lookSection)

        val looked = StoryComposerLookReducer.chosen(StoryComposerLookReducer.chosen(editing, "m1", warm), "m1", polaroid)
        val back = StoryComposerSelectionReducer.cleared(looked)
        val x = back.deck.selectedSlide.elements.single().x
        val moved = StoryComposerTextReducer.moved(back, "t1", 0.1f, 0f)
        assertThat(moved.deck.selectedSlide.elements.single().x).isNotEqualTo(x)
        val sounded = moved.copy(deck = moved.deck.withSelectedAudio(listOf(StoryAudioPlayerObject(id = "a1", isBackground = true))))
        assertThat(sounded.deck.selectedSlide.audio).hasSize(1)

        val reopened = StoryComposerTrailingReducer.sectionOpened(StoryComposerSelectionReducer.mediaSelected(sounded, "m1"), lookSection)
        val expected = StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid")
        assertThat(reopened.mediaLookOf("m1")).isEqualTo(expected)
        assertThat(reopened.deck.selectedSlide.stickers).hasSize(1)
        assertThat(reopened.deck.selectedSlide.placedMedia.single().mediaId).isEqualTo("m1")

        val draft = reopened.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z")
        val restored = MeeshyApi.json.decodeFromString<me.meeshy.sdk.model.StoryComposerDraftSnapshot>(MeeshyApi.json.encodeToString(draft)).toDeck()!!
        assertThat(restored.selectedSlide.mediaLooks).containsExactly("m1", expected)
    }

    @Test
    fun `un ancien brouillon se relit a l identique, sans look`() {
        val deck = state().deck

        val back = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z").toDeck()!!

        assertThat(back.selectedSlide).isEqualTo(deck.selectedSlide)
    }

    @Test
    fun `le look d un media que la diapo ne porte plus ne survit pas au brouillon`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("m1"), mediaLooks = mapOf("m1" to StoryMediaLook(faceEffect = "angel"), "gone" to StoryMediaLook(filterPreset = "cool")))

        val back = StorySlideDeck(listOf(slide), "s").toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z").toDeck()!!

        assertThat(back.selectedSlide.mediaLooks.keys).containsExactly("m1")
    }

    @Test
    fun `la publication cuit chaque image reglee, et la charge ne porte que le media cuit, jamais un look`() {
        val looked = StoryComposerLookReducer.chosen(StoryComposerLookReducer.chosen(state(placed = listOf("m1", "m2"), background = "bg"), "m1", warm), "bg", polaroid)

        val jobs = StoryPublicationLookBake.jobs(looked)
        assertThat(jobs.map { it.mediaId }).containsExactly("bg", "m1")
        val baked = jobs.associate { job -> job.mediaId to PendingMediaUpload("cmid-${job.mediaId}", MediaUploadItem(ByteArray(1), "baked.jpg", "image/jpeg")) }
        val published = StoryPublicationLookBake.applied(looked, baked)
        val plan = publishPlans(published, "fr").single()
        val payload = MeeshyApi.json.encodeToString(plan.request)

        assertThat(payload).doesNotContain("look")
        assertThat(payload).doesNotContain("filterPreset")
        assertThat(plan.request.mediaIds).containsExactly("cmid-bg", "cmid-m1", "m2").inOrder()
        assertThat(plan.dependsOn).containsExactly("cmid-bg", "cmid-m1")
        val objects = plan.request.storyEffects!!.mediaObjects!!
        assertThat(objects.map { it.postMediaId.ifBlank { it.id } }).containsExactly("cmid-bg", "cmid-m1", "m2")
        assertThat(looked.mediaLookOf("m1")).isEqualTo(StoryMediaLook(filterPreset = "warm"))
    }

    @Test
    fun `une diapo sans look publie ses medias d origine, et un look qui ne peint rien ne cuit pas`() {
        val plain = state(placed = listOf("m1"))
        val unknown = plain.copy(deck = plain.deck.withSelectedMediaLook("m1", StoryMediaLook(filterPreset = "sepia-2027")))

        assertThat(StoryPublicationLookBake.jobs(plain)).isEmpty()
        assertThat(StoryPublicationLookBake.jobs(unknown)).isEmpty()
        assertThat(publishPlans(StoryPublicationLookBake.applied(unknown, emptyMap()), "fr").single().request.mediaIds).containsExactly("m1")
    }

    @Test
    fun `la description et la legende d un media cuit suivent sa nouvelle adresse`() {
        val looked = StoryComposerLookReducer.chosen(state(), "m1", warm)
        val described = looked.copy(draft = looked.draft.copy(mediaAlt = mapOf("m1" to "un chat"), mediaCaption = mapOf("m1" to "Minou")))

        val published = StoryPublicationLookBake.applied(described, mapOf("m1" to PendingMediaUpload("cmid-m1", MediaUploadItem(ByteArray(1), "b.jpg", "image/jpeg"))))

        assertThat(published.draft.mediaAlt).containsExactly("cmid-m1", "un chat")
        assertThat(published.draft.mediaCaption).containsExactly("cmid-m1", "Minou")
    }
}
