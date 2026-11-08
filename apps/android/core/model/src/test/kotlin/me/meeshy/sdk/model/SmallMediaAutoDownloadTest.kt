package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #14639 — sous 102 400 octets, une image ou une vidéo se télécharge seule, quel que soit le
 * réseau et la préférence ; seul le hors-ligne l'en empêche. Témoins aux bornes.
 */
class SmallMediaAutoDownloadTest {

    private val never = MediaDownloadPreferences(
        image = AutoDownloadPolicy.NEVER,
        audio = AutoDownloadPolicy.NEVER,
        audioTranslation = AutoDownloadPolicy.NEVER,
        video = AutoDownloadPolicy.NEVER,
    )

    private fun allows(kind: MediaKind, size: Long?, condition: NetworkCondition = NetworkCondition.BAD_CELLULAR, prefs: MediaDownloadPreferences = never) =
        MediaDownloadPolicyEngine.shouldAutoDownload(kind, condition, prefs, size)

    @Test
    fun theThresholdMirrorsTheSharedConstant() {
        assertThat(MediaDownloadPolicyEngine.SMALL_MEDIA_AUTO_DOWNLOAD_BYTES).isEqualTo(102_400L)
    }

    @Test
    fun anImageOf99999Bytes_downloadsOnABadNetwork_evenWhenThePreferenceSaysNever() {
        assertThat(allows(MediaKind.IMAGE, 99_999)).isTrue()
    }

    @Test
    fun aVideoOf102399Bytes_downloadsOnABadNetwork() {
        assertThat(allows(MediaKind.VIDEO, 102_399)).isTrue()
    }

    @Test
    fun atExactly102400Bytes_theNetworkPolicyDecides() {
        assertThat(allows(MediaKind.IMAGE, 102_400)).isFalse()
        val wifiOnly = MediaDownloadPreferences(image = AutoDownloadPolicy.WIFI_ONLY)
        assertThat(allows(MediaKind.IMAGE, 102_400, NetworkCondition.WIFI, wifiOnly)).isTrue()
        assertThat(allows(MediaKind.IMAGE, 102_400, NetworkCondition.GOOD_CELLULAR, wifiOnly)).isFalse()
    }

    @Test
    fun offline_nothingDownloads_howeverSmall() {
        assertThat(allows(MediaKind.IMAGE, 1, NetworkCondition.OFFLINE)).isFalse()
        assertThat(allows(MediaKind.VIDEO, 99_999, NetworkCondition.OFFLINE)).isFalse()
    }

    @Test
    fun anUnknownOrEmptySize_provesNothing_andFallsBackToThePolicy() {
        assertThat(allows(MediaKind.IMAGE, null)).isFalse()
        assertThat(allows(MediaKind.IMAGE, 0)).isFalse()
        assertThat(allows(MediaKind.IMAGE, -5)).isFalse()
    }

    @Test
    fun audioIsNotASmallVisualMedia_itsPolicyStillDecides() {
        assertThat(allows(MediaKind.AUDIO, 10)).isFalse()
        assertThat(allows(MediaKind.AUDIO_TRANSLATION, 10)).isFalse()
    }

    @Test
    fun theDecider_downloadsASmallImageItNeeds_andStillSkipsWhatIsAlreadyThere() {
        val small = MediaAutoDownloadDecider.decideFor(
            mimeType = "image/jpeg",
            isAudioTranslation = false,
            availability = MediaAvailability.NEEDS_DOWNLOAD,
            condition = NetworkCondition.BAD_CELLULAR,
            prefs = never,
            sizeBytes = 99_999,
        )
        assertThat(small).isEqualTo(AutoDownloadDecision.DOWNLOAD)
        val large = MediaAutoDownloadDecider.decideFor(
            mimeType = "image/jpeg",
            isAudioTranslation = false,
            availability = MediaAvailability.NEEDS_DOWNLOAD,
            condition = NetworkCondition.BAD_CELLULAR,
            prefs = never,
            sizeBytes = 102_400,
        )
        assertThat(large).isEqualTo(AutoDownloadDecision.SKIP_POLICY)
        val cached = MediaAutoDownloadDecider.decide(
            kind = MediaKind.IMAGE,
            availability = MediaAvailability.AVAILABLE,
            condition = NetworkCondition.WIFI,
            prefs = never,
            sizeBytes = 10,
        )
        assertThat(cached).isEqualTo(AutoDownloadDecision.SKIP_ALREADY_AVAILABLE)
    }
}
