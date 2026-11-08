package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.NetworkCondition
import org.junit.Test

/** #14639 — le seuil de 100 Ko, branché sur les bulles du fil. */
class BubbleMediaAutoDownloadTest {

    private object French : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val wifiOnly = MediaDownloadPreferences(image = AutoDownloadPolicy.WIFI_ONLY)

    @Test
    fun withoutAPolicyFromTheHost_theBubbleLoadsAsBefore() {
        assertThat(bubbleFetchesFromNetwork(null, 5_000_000)).isTrue()
    }

    @Test
    fun onCellular_aWifiOnlyImageUnder100Ko_isFetched_aLargerOneIsNot() {
        val policy = BubbleMediaAutoDownload(NetworkCondition.GOOD_CELLULAR, wifiOnly)
        assertThat(bubbleFetchesFromNetwork(policy, 99_999)).isTrue()
        assertThat(bubbleFetchesFromNetwork(policy, 102_400)).isFalse()
        assertThat(bubbleFetchesFromNetwork(policy, null)).isFalse()
    }

    @Test
    fun onWifi_theImagePreferenceFetchesEverything() {
        val policy = BubbleMediaAutoDownload(NetworkCondition.WIFI, wifiOnly)
        assertThat(bubbleFetchesFromNetwork(policy, 5_000_000)).isTrue()
    }

    @Test
    fun offline_nothingIsFetched_howeverSmall() {
        val policy = BubbleMediaAutoDownload(NetworkCondition.OFFLINE, wifiOnly)
        assertThat(bubbleFetchesFromNetwork(policy, 1)).isFalse()
    }

    @Test
    fun theBubbleImage_carriesTheAttachmentSize() {
        val message = ApiMessage(
            id = "m", conversationId = "c", senderId = "u",
            attachments = listOf(ApiMessageAttachment(id = "a", mimeType = "image/jpeg", fileUrl = "https://x/a.jpg", fileSize = 99_999)),
        )
        val content = BubbleContentBuilder.build(
            message = message,
            currentUserId = "me",
            preferences = French,
        )
        assertThat(content.images.single().sizeBytes).isEqualTo(99_999L)
    }
}
