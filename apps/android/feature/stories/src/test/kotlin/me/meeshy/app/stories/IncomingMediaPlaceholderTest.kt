package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.previewModel
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/**
 * R5 de #13863 : dès le choix, le média apparaît À SA PLACE sur la scène, en espace réservé — la vignette si on l'a, une
 * forme neutre sinon — avec la progression de la préparation puis de l'envoi. La place est celle que R4 lui a donnée : le
 * fond d'une diapo vide remplit la scène, un média posé se tient où se posera le prochain objet.
 */
class IncomingMediaPlaceholderTest {

    private fun photo(size: Int = 100) = MediaUploadItem(ByteArray(size), "a.jpg", "image/jpeg")

    private fun video() = MediaUploadItem(ByteArray(100), "v.mp4", "video/mp4")

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 10L, 3, 4, null, null)

    private fun picking(state: StoryComposerUiState, vararg items: MediaUploadItem): StoryComposerUiState =
        StoryComposerUploadReducer.started(state, StoryComposerUploadReducer.landings(state, items.size), items = items.toList())

    private val empty = StoryComposerUiState()

    private val withBackground: StoryComposerUiState =
        StoryComposerUploadReducer.uploaded(StoryComposerUploadReducer.started(empty, 1), listOf(uploaded("m1")))

    @Test
    fun `nothing in flight shows no placeholder`() {
        assertThat(empty.incomingPlaceholder()).isNull()
        assertThat(withBackground.incomingPlaceholder()).isNull()
    }

    @Test
    fun `the first media of an empty slide fills the scene with its own thumbnail while it prepares`() {
        val item = photo()

        val placeholder = picking(empty, item).incomingPlaceholder()!!

        assertThat(placeholder.fillsScene).isTrue()
        assertThat(placeholder.preview).isSameInstanceAs(item.previewModel)
        assertThat(placeholder.fraction).isNull()
        assertThat(placeholder.more).isEqualTo(0)
    }

    @Test
    fun `a media posed over a background stands where the next object will be laid`() {
        val at = withBackground.deck.nextObjectPosition()

        val placeholder = picking(withBackground, photo()).incomingPlaceholder()!!

        assertThat(placeholder.fillsScene).isFalse()
        assertThat(placeholder.x).isEqualTo(at.x)
        assertThat(placeholder.y).isEqualTo(at.y)
    }

    @Test
    fun `a video has no thumbnail yet, so the placeholder is a neutral shape`() {
        assertThat(picking(empty, video()).incomingPlaceholder()!!.preview).isNull()
    }

    @Test
    fun `a series says how many more media found their own slides`() {
        assertThat(picking(empty, photo(), photo(), photo()).incomingPlaceholder()!!.more).isEqualTo(2)
    }

    @Test
    fun `the ring follows the bytes of the whole pick, weighted by each media's size`() {
        val state = picking(empty, photo(size = 300), photo(size = 100))

        val half = StoryComposerUploadReducer.progressed(state, 0, sent = 150L, total = 300L)

        assertThat(half.incomingPlaceholder()!!.fraction).isWithin(0.001f).of(150f / 400f)
    }

    @Test
    fun `the placeholder leaves in the same frame the pick ends`() {
        val state = picking(empty, photo())

        assertThat(StoryComposerUploadReducer.uploaded(state, listOf(uploaded("m2"))).incomingPlaceholder()).isNull()
        assertThat(StoryComposerUploadReducer.settled(state).incomingPlaceholder()).isNull()
        assertThat(StoryComposerUploadReducer.settled(state).incomingMedia).isEmpty()
    }
}
