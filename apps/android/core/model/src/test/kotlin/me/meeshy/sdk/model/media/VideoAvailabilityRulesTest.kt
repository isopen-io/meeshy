package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoAvailabilityRulesTest {

    private fun facts(
        optimistic: Boolean = false,
        local: Boolean = false,
        exists: Boolean = false,
        cached: Boolean = false,
        progress: DownloadProgress? = null,
        failure: AttachmentDownloadEvent.Failed? = null,
        size: Long = 0L,
    ) = MediaAvailabilityFacts(
        isOptimistic = optimistic, isLocalFile = local, localFileExists = exists, inTypedStore = cached,
        progress = progress, failure = failure, expectedSizeBytes = size,
    )

    @Test
    fun `une vidéo en cache est prête et sans badge`() {
        val badge = VideoAvailabilityRules.badge(facts(cached = true, size = 5_000_000))
        assertThat(badge).isEqualTo(VideoBadge.None)
    }

    @Test
    fun `une vidéo à télécharger montre sa taille`() {
        val badge = VideoAvailabilityRules.badge(facts(size = 2_000_000))
        assertThat(badge).isInstanceOf(VideoBadge.Download::class.java)
        assertThat((badge as VideoBadge.Download).sizeLabel).isNotNull()
    }

    @Test
    fun `sans taille connue le badge de téléchargement n'a pas d'étiquette`() {
        assertThat((VideoAvailabilityRules.badge(facts()) as VideoBadge.Download).sizeLabel).isNull()
    }

    @Test
    fun `un téléchargement en cours montre un anneau borné`() {
        val badge = VideoAvailabilityRules.badge(facts(progress = DownloadProgress(downloadedBytes = 500, totalBytes = 1000)))
        assertThat(badge).isEqualTo(VideoBadge.Ring(0.5))
    }

    @Test
    fun `une vidéo en échec est indisponible et à réessayer`() {
        val badge = VideoAvailabilityRules.badge(facts(failure = AttachmentDownloadEvent.Failed(gone = false)))
        assertThat(badge).isEqualTo(VideoBadge.Unavailable)
    }

    @Test
    fun `un média optimiste n'affiche jamais de badge, même en échec ou non présent`() {
        val badge = VideoAvailabilityRules.badge(facts(optimistic = true, failure = AttachmentDownloadEvent.Failed(gone = true)))
        assertThat(badge).isEqualTo(VideoBadge.None)
    }

    @Test
    fun `une adresse file qui existe est prête, une qui manque est à télécharger`() {
        assertThat(VideoAvailabilityRules.badge(facts(local = true, exists = true))).isEqualTo(VideoBadge.None)
        assertThat(VideoAvailabilityRules.badge(facts(local = true, exists = false))).isInstanceOf(VideoBadge.Download::class.java)
    }

    @Test
    fun `l'adresse locale est reconnue pour un envoi optimiste`() {
        assertThat(VideoAvailabilityRules.isLocalUri("file:///data/v.mp4")).isTrue()
        assertThat(VideoAvailabilityRules.isLocalUri("content://media/1")).isTrue()
        assertThat(VideoAvailabilityRules.isLocalUri("https://x/v.mp4")).isFalse()
        assertThat(VideoAvailabilityRules.isLocalUri(null)).isFalse()
    }
}
