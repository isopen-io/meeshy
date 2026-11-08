package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaAvailabilityStateTest {
    @Test
    fun `la progression est bornee entre 0 et 1`() {
        assertThat(MediaAvailabilityState.Downloading(500, 1_000).progress).isEqualTo(0.5)
        assertThat(MediaAvailabilityState.Downloading(2_000, 1_000).progress).isEqualTo(1.0)
        assertThat(MediaAvailabilityState.Downloading(-5, 1_000).progress).isEqualTo(0.0)
        assertThat(MediaAvailabilityState.Downloading(10, 0).progress).isEqualTo(0.0)
    }

    @Test
    fun `les octets s'affichent en 410 KB sur 850 KB`() {
        val state = MediaAvailabilityState.Downloading(410 * 1024L, 850 * 1024L)
        assertThat(state.bytesLabel).isEqualTo("410 KB / 850 KB")
        assertThat(state.percent).isEqualTo(48)
    }

    @Test
    fun `sans total le libelle ne garde que les octets recus`() {
        assertThat(MediaAvailabilityState.Downloading(2_048, 0).bytesLabel).isEqualTo("2 KB")
    }

    @Test
    fun `l'etat a telecharger expose la taille formatee ou rien quand elle est inconnue`() {
        assertThat(MediaAvailabilityState.NeedsDownload(1_048_576).sizeLabel).isEqualTo("1 MB")
        assertThat(MediaAvailabilityState.NeedsDownload(0).sizeLabel).isNull()
    }

    @Test
    fun `seul Ready est prêt`() {
        assertThat(MediaAvailabilityState.Ready.isReady).isTrue()
        assertThat(MediaAvailabilityState.NeedsDownload().isReady).isFalse()
        assertThat(MediaAvailabilityState.Failed().isReady).isFalse()
    }
}
