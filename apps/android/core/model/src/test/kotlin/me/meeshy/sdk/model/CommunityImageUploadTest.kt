package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityImageUploadTest {

    @Test
    fun `an avatar is capped at 500 KB and a banner at 800 KB`() {
        assertThat(CommunityImageUpload.maxBytes(ImageUploadTarget.AVATAR)).isEqualTo(500L * 1024)
        assertThat(CommunityImageUpload.maxBytes(ImageUploadTarget.BANNER)).isEqualTo(800L * 1024)
    }

    @Test
    fun `a banner that fits 800 KB is accepted where the same bytes are too large for an avatar`() {
        val size = 600 * 1024
        assertThat(CommunityImageUpload.validateCompressed(ImageUploadTarget.BANNER, size, "image/jpeg"))
            .isEqualTo(ImageUploadValidation.Accepted)
        assertThat(CommunityImageUpload.validateCompressed(ImageUploadTarget.AVATAR, size, "image/jpeg"))
            .isEqualTo(ImageUploadValidation.Rejected(ImageUploadValidation.Reason.TOO_LARGE))
    }

    @Test
    fun `a file that is not an image is refused whatever its size`() {
        assertThat(CommunityImageUpload.validateCompressed(ImageUploadTarget.AVATAR, 10, "video/mp4"))
            .isEqualTo(ImageUploadValidation.Rejected(ImageUploadValidation.Reason.UNSUPPORTED_TYPE))
    }

    @Test
    fun `an empty pick is refused`() {
        assertThat(CommunityImageUpload.validateCompressed(ImageUploadTarget.BANNER, 0, "image/png"))
            .isEqualTo(ImageUploadValidation.Rejected(ImageUploadValidation.Reason.EMPTY))
    }
}
