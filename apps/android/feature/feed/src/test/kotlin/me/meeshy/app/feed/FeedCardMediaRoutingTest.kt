package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMediaType
import org.junit.Test

class FeedCardMediaRoutingTest {

    private val media = listOf(
        feedMediaItem(id = "doc", type = FeedMediaType.DOCUMENT),
        feedMediaItem(id = "img", type = FeedMediaType.IMAGE),
        feedMediaItem(id = "aud", type = FeedMediaType.AUDIO),
        feedMediaItem(id = "vid", type = FeedMediaType.VIDEO, durationSeconds = 75),
    )

    @Test
    fun `le rang d'un visuel se compte parmi les images et les videos seulement`() {
        assertThat(FeedCardMediaRouting.galleryIndex(media, "img")).isEqualTo(0)
        assertThat(FeedCardMediaRouting.galleryIndex(media, "vid")).isEqualTo(1)
    }

    @Test
    fun `un audio ou un document n'ouvre pas la galerie`() {
        assertThat(FeedCardMediaRouting.galleryIndex(media, "aud")).isNull()
        assertThat(FeedCardMediaRouting.galleryIndex(media, "doc")).isNull()
    }

    @Test
    fun `l'etiquette d'une page dit sa position puis le texte alternatif`() {
        assertThat(FeedCardMediaRouting.slideLabel("Media 2 of 5", " A cat ")).isEqualTo("Media 2 of 5. A cat")
        assertThat(FeedCardMediaRouting.slideLabel("Media 2 of 5", "  ")).isEqualTo("Media 2 of 5")
        assertThat(FeedCardMediaRouting.slideLabel("Media 2 of 5", null)).isEqualTo("Media 2 of 5")
    }

    @Test
    fun `la galerie de la carte feuillette images et videos dans l'ordre du post`() {
        val post = feedPostPresentation().copy(media = media)

        val gallery = FeedMediaGallery.ofVisuals(post, index = 1)

        assertThat(gallery.pages.map { it.mediaId }).containsExactly("img", "vid").inOrder()
        assertThat(gallery.pages.map { it.isVideo }).containsExactly(false, true).inOrder()
        assertThat(gallery.startIndex).isEqualTo(1)
        assertThat(gallery.pages[1].durationMillis).isEqualTo(75_000)
    }

    @Test
    fun `une carte sans visuel n'ouvre aucune galerie`() {
        val post = feedPostPresentation().copy(media = media.filter { it.type == FeedMediaType.AUDIO })

        assertThat(FeedMediaGallery.ofVisuals(post, 0).isEmpty).isTrue()
    }

    @Test
    fun `l'index touche hors bornes reste dans la galerie`() {
        val post = feedPostPresentation().copy(media = media)

        assertThat(FeedMediaGallery.ofVisuals(post, 9).startIndex).isEqualTo(1)
        assertThat(FeedMediaGallery.ofVisuals(post, -4).startIndex).isEqualTo(0)
    }
}
