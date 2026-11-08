package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [ImageUploadValidator] — the pure gate that decides
 * whether a picked file may become a profile avatar/banner (feature-parity §K,
 * "avatar + banner upload"). The branch table is: empty → EMPTY, non-image →
 * UNSUPPORTED_TYPE, oversize → TOO_LARGE (per-target ceiling), else Accepted; the
 * order guarantees the most actionable reason wins and the per-target [maxBytes]
 * makes the same file pass as a banner yet fail as an avatar.
 */
class ImageUploadValidatorTest {

    private val avatar = ImageUploadTarget.AVATAR
    private val banner = ImageUploadTarget.BANNER

    private fun reasonOf(v: ImageUploadValidation): ImageUploadValidation.Reason =
        (v as ImageUploadValidation.Rejected).reason

    @Test
    fun acceptsAJpegWellUnderTheAvatarCeiling() {
        val result = ImageUploadValidator.validate(avatar, byteCount = 100_000, mimeType = "image/jpeg")

        assertThat(result).isEqualTo(ImageUploadValidation.Accepted)
    }

    @Test
    fun acceptsAPngForTheBanner() {
        val result = ImageUploadValidator.validate(banner, byteCount = 100_000, mimeType = "image/png")

        assertThat(result).isEqualTo(ImageUploadValidation.Accepted)
    }

    @Test
    fun rejectsAnEmptyPickAsEmpty() {
        val result = ImageUploadValidator.validate(avatar, byteCount = 0, mimeType = "image/jpeg")

        assertThat(reasonOf(result)).isEqualTo(ImageUploadValidation.Reason.EMPTY)
    }

    @Test
    fun rejectsANegativeByteCountAsEmpty() {
        val result = ImageUploadValidator.validate(avatar, byteCount = -1, mimeType = "image/jpeg")

        assertThat(reasonOf(result)).isEqualTo(ImageUploadValidation.Reason.EMPTY)
    }

    @Test
    fun emptyTakesPriorityOverABadType() {
        // A zero-byte pick with a non-image type is reported as EMPTY, not the type error.
        val result = ImageUploadValidator.validate(avatar, byteCount = 0, mimeType = "video/mp4")

        assertThat(reasonOf(result)).isEqualTo(ImageUploadValidation.Reason.EMPTY)
    }

    @Test
    fun rejectsAVideoAsUnsupportedType() {
        val result = ImageUploadValidator.validate(avatar, byteCount = 100_000, mimeType = "video/mp4")

        assertThat(reasonOf(result)).isEqualTo(ImageUploadValidation.Reason.UNSUPPORTED_TYPE)
    }

    @Test
    fun rejectsABlankMimeAsUnsupportedType() {
        val result = ImageUploadValidator.validate(avatar, byteCount = 100_000, mimeType = "")

        assertThat(reasonOf(result)).isEqualTo(ImageUploadValidation.Reason.UNSUPPORTED_TYPE)
    }

    @Test
    fun rejectsOctetStreamAsUnsupportedType() {
        val result =
            ImageUploadValidator.validate(avatar, byteCount = 100_000, mimeType = "application/octet-stream")

        assertThat(reasonOf(result)).isEqualTo(ImageUploadValidation.Reason.UNSUPPORTED_TYPE)
    }

    @Test
    fun acceptsAnUppercaseImageMime() {
        val result = ImageUploadValidator.validate(avatar, byteCount = 100_000, mimeType = "IMAGE/JPEG")

        assertThat(result).isEqualTo(ImageUploadValidation.Accepted)
    }

    @Test
    fun acceptsAParameterisedImageMime() {
        val result =
            ImageUploadValidator.validate(avatar, byteCount = 100_000, mimeType = "image/jpeg; charset=binary")

        assertThat(result).isEqualTo(ImageUploadValidation.Accepted)
    }

    @Test
    fun unsupportedTypeTakesPriorityOverOversize() {
        // A huge non-image reports the type error (more actionable) rather than TOO_LARGE.
        val huge = (ImageUploadTarget.BANNER.maxBytes + 1).toInt()
        val result = ImageUploadValidator.validateCompressed(avatar, byteCount = huge, mimeType = "video/mp4")

        assertThat(reasonOf(result)).isEqualTo(ImageUploadValidation.Reason.UNSUPPORTED_TYPE)
    }

    @Test
    fun acceptsAFileExactlyAtTheAvatarCeiling() {
        val atLimit = ImageUploadTarget.AVATAR.maxBytes.toInt()

        val result = ImageUploadValidator.validate(avatar, byteCount = atLimit, mimeType = "image/jpeg")

        assertThat(result).isEqualTo(ImageUploadValidation.Accepted)
    }

    @Test
    fun aHugeImageIsNotTerminalBeforeCompression() {
        val huge = (ImageUploadTarget.BANNER.maxBytes * 4).toInt()

        assertThat(ImageUploadValidator.validate(avatar, byteCount = huge, mimeType = "image/jpeg"))
            .isEqualTo(ImageUploadValidation.Accepted)
    }

    @Test
    fun rejectsAFileOneByteOverTheAvatarCeilingAsTooLargeOnceCompressed() {
        val overLimit = (ImageUploadTarget.AVATAR.maxBytes + 1).toInt()

        val result = ImageUploadValidator.validateCompressed(avatar, byteCount = overLimit, mimeType = "image/jpeg")

        assertThat(reasonOf(result)).isEqualTo(ImageUploadValidation.Reason.TOO_LARGE)
    }

    @Test
    fun compressedCheckKeepsTheEmptyAndTypeReasonsFirst() {
        val huge = (ImageUploadTarget.BANNER.maxBytes + 1).toInt()

        assertThat(reasonOf(ImageUploadValidator.validateCompressed(avatar, 0, "image/jpeg")))
            .isEqualTo(ImageUploadValidation.Reason.EMPTY)
        assertThat(reasonOf(ImageUploadValidator.validateCompressed(avatar, huge, "video/mp4")))
            .isEqualTo(ImageUploadValidation.Reason.UNSUPPORTED_TYPE)
    }

    @Test
    fun theSameCompressedFileFailsTheAvatarButPassesTheBanner() {
        val tenMiB = 10 * 1024 * 1024

        val asAvatar = ImageUploadValidator.validateCompressed(avatar, byteCount = tenMiB, mimeType = "image/jpeg")
        val asBanner = ImageUploadValidator.validateCompressed(banner, byteCount = tenMiB, mimeType = "image/jpeg")

        assertThat(reasonOf(asAvatar)).isEqualTo(ImageUploadValidation.Reason.TOO_LARGE)
        assertThat(asBanner).isEqualTo(ImageUploadValidation.Accepted)
    }
}
