package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaMappingTest {

    private fun wire(
        id: String = "a1",
        fileUrl: String? = "https://cdn.meeshy.me/a1.jpg",
        mimeType: String? = "image/jpeg",
        fileSize: Long? = 2048L,
        width: Int? = 800,
        height: Int? = 600,
        duration: Long? = null,
        thumbnailUrl: String? = "https://cdn.meeshy.me/a1_thumb.jpg",
    ) = MediaAttachmentWire(
        id = id,
        fileUrl = fileUrl,
        mimeType = mimeType,
        fileSize = fileSize,
        width = width,
        height = height,
        duration = duration,
        thumbnailUrl = thumbnailUrl,
    )

    @Test
    fun fullPayload_mapsEveryField() {
        val media = wire(duration = 1500L).toUploadedMedia()

        assertThat(media).isNotNull()
        media!!
        assertThat(media.id).isEqualTo("a1")
        assertThat(media.url).isEqualTo("https://cdn.meeshy.me/a1.jpg")
        assertThat(media.mimeType).isEqualTo("image/jpeg")
        assertThat(media.fileSize).isEqualTo(2048L)
        assertThat(media.width).isEqualTo(800)
        assertThat(media.height).isEqualTo(600)
        assertThat(media.durationMs).isEqualTo(1500L)
        assertThat(media.thumbnailUrl).isEqualTo("https://cdn.meeshy.me/a1_thumb.jpg")
    }

    @Test
    fun blankId_mapsToNull() {
        assertThat(wire(id = "").toUploadedMedia()).isNull()
        assertThat(wire(id = "   ").toUploadedMedia()).isNull()
    }

    @Test
    fun absentUrl_mapsToNull() {
        assertThat(wire(fileUrl = null).toUploadedMedia()).isNull()
    }

    @Test
    fun blankUrl_mapsToNull() {
        assertThat(wire(fileUrl = "  ").toUploadedMedia()).isNull()
    }

    @Test
    fun blankMimeType_fallsBackToOctetStream() {
        assertThat(wire(mimeType = null).toUploadedMedia()!!.mimeType)
            .isEqualTo(DEFAULT_MEDIA_MIME_TYPE)
        assertThat(wire(mimeType = "").toUploadedMedia()!!.mimeType)
            .isEqualTo(DEFAULT_MEDIA_MIME_TYPE)
    }

    @Test
    fun absentFileSize_collapsesToZero() {
        assertThat(wire(fileSize = null).toUploadedMedia()!!.fileSize).isEqualTo(0L)
    }

    @Test
    fun negativeFileSize_collapsesToZero() {
        assertThat(wire(fileSize = -10L).toUploadedMedia()!!.fileSize).isEqualTo(0L)
    }

    @Test
    fun zeroOrNegativeDimensions_collapseToNull() {
        val zero = wire(width = 0, height = 0).toUploadedMedia()!!
        assertThat(zero.width).isNull()
        assertThat(zero.height).isNull()

        val negative = wire(width = -1, height = -1).toUploadedMedia()!!
        assertThat(negative.width).isNull()
        assertThat(negative.height).isNull()
    }

    @Test
    fun zeroOrNegativeDuration_collapsesToNull() {
        assertThat(wire(duration = 0L).toUploadedMedia()!!.durationMs).isNull()
        assertThat(wire(duration = -5L).toUploadedMedia()!!.durationMs).isNull()
    }

    @Test
    fun blankThumbnail_collapsesToNull() {
        assertThat(wire(thumbnailUrl = null).toUploadedMedia()!!.thumbnailUrl).isNull()
        assertThat(wire(thumbnailUrl = "   ").toUploadedMedia()!!.thumbnailUrl).isNull()
    }

    @Test
    fun textOnlyMetadata_keepsPositiveValuesAndNullsTheRest() {
        val audio = wire(
            mimeType = "audio/mpeg",
            width = null,
            height = null,
            duration = 30_000L,
            thumbnailUrl = null,
        ).toUploadedMedia()!!

        assertThat(audio.mimeType).isEqualTo("audio/mpeg")
        assertThat(audio.width).isNull()
        assertThat(audio.height).isNull()
        assertThat(audio.durationMs).isEqualTo(30_000L)
        assertThat(audio.thumbnailUrl).isNull()
    }
}
