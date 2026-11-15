package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.ui.component.bubble.BubbleMediaAutoDownload
import org.junit.Test

class FeedVideoMediaCellPolicyTest {

    private fun policy(condition: NetworkCondition, video: AutoDownloadPolicy = AutoDownloadPolicy.WIFI_ONLY) =
        BubbleMediaAutoDownload(condition, MediaDownloadPreferences(video = video))

    @Test
    fun `sans politique fournie par l'hote rien ne part seul`() {
        assertThat(FeedVideoCellPolicy.mode(null)).isEqualTo(FeedVideoCellMode.MANUAL)
    }

    @Test
    fun `en wifi une preference wifi seulement telecharge la video`() {
        assertThat(FeedVideoCellPolicy.mode(policy(NetworkCondition.WIFI))).isEqualTo(FeedVideoCellMode.AUTO)
    }

    @Test
    fun `en cellulaire une preference wifi seulement retient la video`() {
        assertThat(FeedVideoCellPolicy.mode(policy(NetworkCondition.GOOD_CELLULAR))).isEqualTo(FeedVideoCellMode.MANUAL)
    }

    @Test
    fun `hors ligne la video garde sa vignette sans lecture`() {
        assertThat(FeedVideoCellPolicy.mode(policy(NetworkCondition.OFFLINE, AutoDownloadPolicy.ALWAYS)))
            .isEqualTo(FeedVideoCellMode.OFFLINE)
    }

    @Test
    fun `une preference jamais retient la video meme en wifi`() {
        assertThat(FeedVideoCellPolicy.mode(policy(NetworkCondition.WIFI, AutoDownloadPolicy.NEVER)))
            .isEqualTo(FeedVideoCellMode.MANUAL)
    }

    @Test
    fun `une petite video descend seule des que l'appareil est en ligne`() {
        val small = 50L * 1024
        assertThat(FeedVideoCellPolicy.mode(policy(NetworkCondition.GOOD_CELLULAR, AutoDownloadPolicy.NEVER), sizeBytes = small))
            .isEqualTo(FeedVideoCellMode.AUTO)
    }
}
