package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.cacheCategory
import me.meeshy.sdk.model.media.MediaAvailabilityResolution.resolve
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Test

class MediaAvailabilityResolutionTest {
    private fun facts(
        optimistic: Boolean = false,
        local: Boolean = false,
        localExists: Boolean = false,
        cached: Boolean = false,
        progress: DownloadProgress? = null,
        failure: AttachmentDownloadEvent.Failed? = null,
        size: Long = 850,
        offline: Boolean = false,
    ) = MediaAvailabilityFacts(optimistic, local, localExists, cached, progress, failure, size, offline)

    @Test
    fun `un fichier en cache est pret meme hors ligne`() {
        assertThat(resolve(facts(cached = true, offline = true))).isEqualTo(MediaAvailabilityState.Ready)
    }

    @Test
    fun `un file existant est pret et un file absent est a telecharger`() {
        assertThat(resolve(facts(local = true, localExists = true))).isEqualTo(MediaAvailabilityState.Ready)
        assertThat(resolve(facts(local = true, localExists = false, cached = true))).isInstanceOf(MediaAvailabilityState.NeedsDownload::class.java)
    }

    @Test
    fun `un media optimiste n'affiche jamais d'etat de telechargement`() {
        assertThat(resolve(facts(optimistic = true, progress = DownloadProgress(1, 2)))).isEqualTo(MediaAvailabilityState.Ready)
        assertThat(resolve(facts(optimistic = true, local = true, localExists = false))).isEqualTo(MediaAvailabilityState.Ready)
    }

    @Test
    fun `un telechargement en vol rend les octets et reprend la taille attendue sans total`() {
        assertThat(resolve(facts(progress = DownloadProgress(410, 0), size = 850)))
            .isEqualTo(MediaAvailabilityState.Downloading(410, 850))
    }

    @Test
    fun `non local donne a telecharger avec taille et drapeau hors ligne`() {
        assertThat(resolve(facts(offline = true))).isEqualTo(MediaAvailabilityState.NeedsDownload(850, true))
    }

    @Test
    fun `un echec donne reessayer et garde la raison`() {
        assertThat(resolve(facts(failure = AttachmentDownloadEvent.Failed(gone = true))))
            .isEqualTo(MediaAvailabilityState.Failed(true, 850))
    }

    private val wifi = NetworkCondition.WIFI
    private fun auto(
        state: MediaAvailabilityState,
        kind: MediaKind? = MediaKind.AUDIO,
        condition: NetworkCondition = wifi,
        prefs: MediaDownloadPreferences = MediaDownloadPreferences(),
        started: Boolean = false,
    ) = MediaAvailabilityResolution.shouldAutoStart(state, kind, condition, prefs, started)

    @Test
    fun `une piece a telecharger sur wifi demarre une seule fois`() {
        val needs = MediaAvailabilityState.NeedsDownload(5_000_000)
        assertThat(auto(needs, MediaKind.AUDIO)).isTrue()
        assertThat(auto(needs, MediaKind.AUDIO, started = true)).isFalse()
    }

    @Test
    fun `ni pret ni en cours ni echec ne demarrent`() {
        assertThat(auto(MediaAvailabilityState.Ready)).isFalse()
        assertThat(auto(MediaAvailabilityState.Downloading(1, 2))).isFalse()
        assertThat(auto(MediaAvailabilityState.Failed())).isFalse()
    }

    @Test
    fun `hors ligne la politique bloque et un type inclassable ne part pas`() {
        val needs = MediaAvailabilityState.NeedsDownload(5_000_000)
        assertThat(auto(needs, condition = NetworkCondition.OFFLINE)).isFalse()
        assertThat(auto(needs, kind = null)).isFalse()
    }

    @Test
    fun `chaque type suit sa propre preference`() {
        val needs = MediaAvailabilityState.NeedsDownload(5_000_000)
        val prefs = MediaDownloadPreferences().copy(video = AutoDownloadPolicy.NEVER)
        assertThat(auto(needs, MediaKind.VIDEO, prefs = prefs)).isFalse()
        assertThat(auto(needs, MediaKind.AUDIO_TRANSLATION, prefs = prefs)).isTrue()
    }

    @Test
    fun `la categorie de cache suit le type`() {
        assertThat(MediaKind.AUDIO_TRANSLATION.cacheCategory()).isEqualTo(MediaCacheCategory.AUDIO)
        assertThat(MediaKind.IMAGE.cacheCategory()).isEqualTo(MediaCacheCategory.IMAGES)
        assertThat(MediaKind.VIDEO.cacheCategory()).isEqualTo(MediaCacheCategory.VIDEO)
    }
}
