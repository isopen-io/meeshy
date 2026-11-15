package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.piece.PieceBadge
import org.junit.Test

/** #14652 — une vidéo rendue en ligne de fichier suit la MÊME politique que l'image de bulle (iOS `VideoAvailabilityResolver`). */
class BubbleVideoAutoDownloadTest {

    private val wifiOnly = MediaDownloadPreferences(video = AutoDownloadPolicy.WIFI_ONLY)

    private fun video(size: Int?) = BubbleFile(attachmentId = "v", name = "clip.mp4", sizeBytes = size, url = "https://x/v.mp4", isVideo = true)

    private val idle = PieceBadge.Idle(null)

    @Test
    fun withoutAPolicyFromTheHost_nothingStartsByItself() {
        assertThat(bubbleAutoDownloadsVideo(null, video(1_000), idle)).isFalse()
    }

    @Test
    fun onCellular_aWifiOnlyVideoUnder100Ko_downloadsByItself_aLargerOrUnknownOneDoesNot() {
        val policy = BubbleMediaAutoDownload(NetworkCondition.GOOD_CELLULAR, wifiOnly)
        assertThat(bubbleAutoDownloadsVideo(policy, video(102_399), idle)).isTrue()
        assertThat(bubbleAutoDownloadsVideo(policy, video(102_400), idle)).isFalse()
        assertThat(bubbleAutoDownloadsVideo(policy, video(null), idle)).isFalse()
    }

    @Test
    fun onWifi_theVideoPreferenceDecides_likeIos() {
        assertThat(bubbleAutoDownloadsVideo(BubbleMediaAutoDownload(NetworkCondition.WIFI, wifiOnly), video(50_000_000), idle)).isTrue()
        val never = MediaDownloadPreferences(video = AutoDownloadPolicy.NEVER)
        assertThat(bubbleAutoDownloadsVideo(BubbleMediaAutoDownload(NetworkCondition.WIFI, never), video(50_000_000), idle)).isFalse()
        assertThat(bubbleAutoDownloadsVideo(BubbleMediaAutoDownload(NetworkCondition.WIFI, never), video(4_000), idle)).isTrue()
    }

    @Test
    fun offline_nothingStarts_howeverSmall() {
        val policy = BubbleMediaAutoDownload(NetworkCondition.OFFLINE, wifiOnly)
        assertThat(bubbleAutoDownloadsVideo(policy, video(1), idle)).isFalse()
    }

    @Test
    fun onlyAVideoRowStillToDownload_startsByItself() {
        val policy = BubbleMediaAutoDownload(NetworkCondition.WIFI, wifiOnly)
        assertThat(bubbleAutoDownloadsVideo(policy, video(1_000).copy(isVideo = false), idle)).isFalse()
        listOf(PieceBadge.None, PieceBadge.Sealed, PieceBadge.Ready, PieceBadge.Failed, PieceBadge.Downloading(null)).forEach { badge ->
            assertThat(bubbleAutoDownloadsVideo(policy, video(1_000), badge)).isFalse()
        }
    }
}
