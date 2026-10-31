package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu
import org.junit.Test

/**
 * #13852 — UN ordre pour tous les objets de la scène (texte, média posé, sticker, lieu, pastille audio), le `zIndex` d'iOS
 * (`StoryComposerViewModel+ZOrder`) : le dernier ajouté passe au-dessus, « Ordre » s'offre dès qu'un autre objet existe,
 * quelle que soit sa famille, et la publication porte cet ordre au lecteur.
 */
class StorySceneStackTest {

    private fun state(slide: StorySlide) = StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id))

    private fun ids(state: StoryComposerUiState) = StorySceneStack.order(state.deck.selectedSlide).map { it.id }

    private val withPhoto = state(StorySlide(id = "s", mediaIds = listOf("bg", "photo")))

    private fun voice(id: String, background: Boolean = false) =
        StoryAudioPlayerObject(id = id, postMediaId = "p-$id", isBackground = if (background) true else null, x = 0.5, y = 0.7)

    @Test
    fun `a slide written before the stack keeps the painting order it had, family after family`() {
        val legacy = StorySlide(
            id = "s",
            mediaIds = listOf("m"),
            elements = listOf(StoryTextElement(id = "t", text = "a")),
            placedMedia = listOf(StoryPlacedMedia("m")),
            stickers = listOf(StoryStickerElement(id = "k", emoji = "🔥")),
            places = listOf(StoryLocationObject(id = "p", place = me.meeshy.sdk.model.SharedPlace(latitude = 48.8, longitude = 2.3, name = "Paris"))),
            audio = listOf(voice("a"), voice("bg-sound", background = true)),
        )

        assertThat(StorySceneStack.order(legacy).map { it.id }).containsExactly("t", "m", "k", "p", "a").inOrder()
    }

    @Test
    fun `a text added after a placed media paints above it`() {
        val placed = StoryComposerPlacedMediaReducer.placed(withPhoto, "photo")

        val written = StoryComposerTextReducer.added(placed, "t")

        assertThat(ids(written)).containsExactly("photo", "t").inOrder()
    }

    @Test
    fun `a sticker, a place and a voice posed later each go on top`() {
        val placed = StoryComposerPlacedMediaReducer.placed(withPhoto, "photo")
        val stuck = StoryComposerStickerReducer.added(placed, "🔥", "k")
        val pinned = stuck.copy(deck = stuck.deck.addPlaceToSelected(StoryLocationObject(id = "p", place = me.meeshy.sdk.model.SharedPlace(latitude = 45.7, longitude = 4.8, name = "Lyon"))))
        val spoken = pinned.copy(deck = pinned.deck.withSelectedAudio(pinned.deck.selectedSlide.audio + voice("v")))

        assertThat(ids(spoken)).containsExactly("photo", "k", "p", "v").inOrder()
    }

    @Test
    fun `order moves an object across families, one step or to either end`() {
        val placed = StoryComposerPlacedMediaReducer.placed(withPhoto, "photo")
        val scene = StoryComposerStickerReducer.added(StoryComposerTextReducer.added(placed, "t"), "🔥", "k")
        val photo = SceneObjectRef(ComposerObjectKind.MEDIA, "photo")

        assertThat(ids(StoryComposerSceneReducer.restacked(scene, photo, StoryZOrder.FORWARD))).containsExactly("t", "photo", "k").inOrder()
        assertThat(ids(StoryComposerSceneReducer.restacked(scene, photo, StoryZOrder.TO_FRONT))).containsExactly("t", "k", "photo").inOrder()
        val sticker = SceneObjectRef(ComposerObjectKind.STICKER, "k")
        assertThat(ids(StoryComposerSceneReducer.restacked(scene, sticker, StoryZOrder.TO_BACK))).containsExactly("k", "photo", "t").inOrder()
        assertThat(StoryComposerSceneReducer.restacked(scene, photo, StoryZOrder.TO_BACK)).isSameInstanceAs(scene)
    }

    @Test
    fun `order is offered to a lone text as soon as an object of another family shares the scene`() {
        val placed = StoryComposerPlacedMediaReducer.placed(withPhoto, "photo")
        val written = StoryComposerTextReducer.added(placed, "t").copy(framedTextElementId = "t")

        val choices = written.selectionBar?.orderChoices

        assertThat(choices).containsExactly(
            SceneObjectMenu.Action.BRING_TO_FRONT, SceneObjectMenu.Action.BRING_FORWARD,
            SceneObjectMenu.Action.SEND_BACKWARD, SceneObjectMenu.Action.SEND_TO_BACK,
        ).inOrder()
    }

    @Test
    fun `a placed media, a place and a voice are ordered too, the background never`() {
        val placed = StoryComposerPlacedMediaReducer.placed(withPhoto, "photo")
        val written = StoryComposerTextReducer.added(placed, "t")
        val media = StoryComposerSelectionReducer.mediaSelected(written, "photo")
        val background = StoryComposerSelectionReducer.mediaSelected(written.copy(deck = written.deck.toggleSelectedBackgroundMedia("bg")), "bg")

        assertThat(media.selectionBar?.orderChoices).isNotEmpty()
        assertThat(background.selectionBar?.orderChoices.orEmpty()).isEmpty()
    }

    @Test
    fun `the publication carries the order to the reader as one zIndex across families`() {
        val placed = StoryComposerPlacedMediaReducer.placed(
            withPhoto.copy(attachments = listOf(me.meeshy.sdk.model.UploadedMedia("photo", "https://cdn/p.jpg", "image/jpeg", 1, 1, 1, null, null))),
            "photo",
        )
        val scene = StoryComposerStickerReducer.added(StoryComposerTextReducer.typed(StoryComposerTextReducer.added(placed, "t"), "Salut"), "🔥", "k")
        val raised = StoryComposerSceneReducer.restacked(scene, SceneObjectRef(ComposerObjectKind.MEDIA, "photo"), StoryZOrder.TO_FRONT)

        val effects = publishPlans(raised, "fr").single().request.storyEffects!!

        val text = effects.textObjects.single().zIndex
        val sticker = effects.stickerObjects!!.single().zIndex
        val media = effects.mediaObjects!!.single { !it.isBackground }.zIndex
        assertThat(listOf(text, sticker, media)).isInStrictOrder()
    }

    @Test
    fun `a saved draft reopens with the same order`() {
        val placed = StoryComposerPlacedMediaReducer.placed(withPhoto, "photo")
        val scene = StoryComposerStickerReducer.added(StoryComposerTextReducer.typed(StoryComposerTextReducer.added(placed, "t"), "Salut"), "🔥", "k")
        val raised = StoryComposerSceneReducer.restacked(scene, SceneObjectRef(ComposerObjectKind.MEDIA, "photo"), StoryZOrder.TO_FRONT)

        val reopened = raised.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z").toDeck()!!

        assertThat(StorySceneStack.order(reopened.selectedSlide).map { it.id }).containsExactly("t", "k", "photo").inOrder()
    }
}
