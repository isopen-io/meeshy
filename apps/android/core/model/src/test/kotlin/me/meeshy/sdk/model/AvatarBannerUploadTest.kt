package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [AvatarBannerUpload.firstUploadedUrl] — selects which
 * uploaded row becomes the profile image URL. It takes the first row with a usable
 * (non-blank) URL and returns `null` when nothing usable came back, so the caller
 * treats an empty/degenerate response as an upload failure instead of linking a
 * blank URL (feature-parity §K).
 */
class AvatarBannerUploadTest {

    private fun media(id: String, url: String) = UploadedMedia(
        id = id,
        url = url,
        mimeType = "image/jpeg",
        fileSize = 1L,
        width = null,
        height = null,
        durationMs = null,
        thumbnailUrl = null,
    )

    @Test
    fun returnsNullForAnEmptyResponse() {
        assertThat(AvatarBannerUpload.firstUploadedUrl(emptyList())).isNull()
    }

    @Test
    fun returnsTheFirstRowsUrl() {
        val uploaded = listOf(media("a", "https://cdn/a.jpg"), media("b", "https://cdn/b.jpg"))

        assertThat(AvatarBannerUpload.firstUploadedUrl(uploaded)).isEqualTo("https://cdn/a.jpg")
    }

    @Test
    fun skipsABlankUrlAndReturnsTheFirstUsableOne() {
        val uploaded = listOf(media("a", "   "), media("b", "https://cdn/b.jpg"))

        assertThat(AvatarBannerUpload.firstUploadedUrl(uploaded)).isEqualTo("https://cdn/b.jpg")
    }

    @Test
    fun returnsNullWhenEveryUrlIsBlank() {
        val uploaded = listOf(media("a", ""), media("b", "   "))

        assertThat(AvatarBannerUpload.firstUploadedUrl(uploaded)).isNull()
    }
}
