package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AvailabilityTest {
    @Test fun `fichier local present est pret`() {
        assertThat(AudioAvailability.resolve(true, true, false)).isEqualTo(AudioAvailability.Ready)
        assertThat(VideoAvailability.resolve(true, true, false)).isEqualTo(VideoAvailability.Ready)
    }

    @Test fun `fichier local absent demande un telechargement meme si le cache serveur existe`() {
        assertThat(AudioAvailability.resolve(true, false, true)).isEqualTo(AudioAvailability.NeedsDownload)
    }

    @Test fun `serveur en cache est pret, sinon a telecharger`() {
        assertThat(VideoAvailability.resolve(false, false, true)).isEqualTo(VideoAvailability.Ready)
        assertThat(VideoAvailability.resolve(false, false, false)).isEqualTo(VideoAvailability.NeedsDownload)
    }

    @Test fun `le telechargement porte progression et octets`() {
        val d = AudioAvailability.Downloading(0.5, 410, 850)
        assertThat(d.downloadedBytes).isEqualTo(410)
        assertThat(AudioAvailability.Downloading(0.1).totalBytes).isEqualTo(0)
    }
}
