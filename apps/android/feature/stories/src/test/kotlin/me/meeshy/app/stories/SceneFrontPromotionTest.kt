package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/**
 * #13917 — toucher un objet posé le fait passer au premier plan (décision porteur du 2026-10-31, R6 de
 * `2026-10-31-un-seul-compositeur-design.md`) : texte, média posé, sticker, lieu, pastille de son montent au sommet de
 * l'ordre unique de la scène ; pour envoyer un objet au dernier rang, on touche les autres. Le fond n'entre jamais dans
 * cet ordre, et la publication comme le brouillon portent l'ordre que les touchers ont laissé.
 */
class SceneFrontPromotionTest {

    private val photo = UploadedMedia("photo", "https://cdn/p.jpg", "image/jpeg", 1, 1, 1, null, null)

    private fun base() = StoryComposerUiState(
        deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("bg", "photo"))), "s"),
        attachments = listOf(photo),
    )

    /** Du fond vers le devant : photo, t, k, p, v — l'ordre d'arrivée. */
    private fun scene(): StoryComposerUiState {
        val placed = StoryComposerPlacedMediaReducer.placed(base(), "photo")
        val written = StoryComposerTextReducer.typed(StoryComposerTextReducer.added(placed, "t"), "Salut")
        val stuck = StoryComposerStickerReducer.added(written, "🔥", "k")
        val pinned = stuck.copy(
            deck = stuck.deck.addPlaceToSelected(
                StoryLocationObject(id = "p", place = SharedPlace(latitude = 45.7, longitude = 4.8, name = "Lyon")),
            ),
        )
        val voice = StoryAudioPlayerObject(id = "v", postMediaId = "pm-v", x = 0.5, y = 0.7)
        return pinned.copy(deck = pinned.deck.withSelectedAudio(pinned.deck.selectedSlide.audio + voice))
    }

    private fun ids(state: StoryComposerUiState) = StorySceneStack.order(state.deck.selectedSlide).map { it.id }

    @Test
    fun `the scene starts in arrival order`() {
        assertThat(ids(scene())).containsExactly("photo", "t", "k", "p", "v").inOrder()
    }

    @Test
    fun `touching a placed media brings it to the front`() {
        assertThat(ids(StoryComposerSelectionReducer.mediaSelected(scene(), "photo")).last()).isEqualTo("photo")
    }

    @Test
    fun `touching a text on the scene brings it to the front`() {
        assertThat(ids(StoryComposerTextReducer.tapped(scene(), "t")).last()).isEqualTo("t")
        assertThat(ids(StoryComposerTextReducer.selected(scene(), "t")).last()).isEqualTo("t")
    }

    @Test
    fun `touching a sticker, a place or a voice brings it to the front`() {
        assertThat(ids(StoryComposerStickerReducer.selected(scene(), "k")).last()).isEqualTo("k")
        assertThat(ids(StoryComposerReferencesReducer.selected(scene(), "p")).last()).isEqualTo("p")
        val voiceLow = StoryComposerSelectionReducer.mediaSelected(scene(), "photo")
        assertThat(ids(StoryComposerSelectionReducer.soundSelected(voiceLow, "v")).last()).isEqualTo("v")
    }

    @Test
    fun `touching A then B leaves B above A, the others keeping their order`() {
        val a = StoryComposerSelectionReducer.mediaSelected(scene(), "photo")
        val b = StoryComposerTextReducer.tapped(a, "t")

        assertThat(ids(b)).containsExactly("k", "p", "v", "photo", "t").inOrder()
    }

    @Test
    fun `sending an object to the back is touching the others, from the deepest to the highest`() {
        val photoOnTop = StoryComposerSelectionReducer.mediaSelected(scene(), "photo")
        val touched = listOf("t", "k", "p", "v").fold(photoOnTop) { acc, id ->
            StoryComposerSceneReducer.trackSelected(acc, id)
        }

        assertThat(ids(photoOnTop).last()).isEqualTo("photo")
        assertThat(ids(touched)).containsExactly("photo", "t", "k", "p", "v").inOrder()
    }

    @Test
    fun `touching the object already on top leaves the deck untouched`() {
        val top = StoryComposerSelectionReducer.mediaSelected(scene(), "photo")

        assertThat(StoryComposerSelectionReducer.mediaSelected(top, "photo").deck).isSameInstanceAs(top.deck)
    }

    @Test
    fun `touching the background never moves anything`() {
        val withBackground = scene().let { it.copy(deck = it.deck.toggleSelectedBackgroundMedia("bg")) }

        val touched = StoryComposerSelectionReducer.mediaSelected(withBackground, "bg")

        assertThat(touched.selectedMediaId).isEqualTo("bg")
        assertThat(touched.deck).isSameInstanceAs(withBackground.deck)
    }

    @Test
    fun `the publication carries the order the touches left`() {
        val touched = StoryComposerTextReducer.tapped(StoryComposerSelectionReducer.mediaSelected(scene(), "photo"), "t")

        val effects = publishPlans(touched, "fr").single().request.storyEffects!!

        val sticker = effects.stickerObjects!!.single().zIndex
        val media = effects.mediaObjects!!.single { !it.isBackground }.zIndex
        val text = effects.textObjects.single().zIndex
        assertThat(listOf(sticker, media, text)).isInStrictOrder()
    }

    @Test
    fun `a saved draft reopens with the order the touches left`() {
        val touched = StoryComposerStickerReducer.selected(StoryComposerSelectionReducer.mediaSelected(scene(), "photo"), "k")

        val reopened = touched.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z").toDeck()!!

        assertThat(StorySceneStack.order(reopened.selectedSlide).map { it.id }).containsExactly("t", "p", "v", "photo", "k").inOrder()
    }

    @Test
    fun `the selection bar no longer serves an Order action`() {
        val framed = StoryComposerTextReducer.tapped(scene(), "t")

        assertThat(framed.selectionBar!!.actions.map { it.name }).doesNotContain("ORDER")
    }
}
