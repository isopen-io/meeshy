package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.DEFAULT_MEDIA_MIME_TYPE
import org.junit.Test

class MediaUploadTest {

    @Test
    fun fileName_nonBlank_passesThrough() {
        assertThat(MediaUpload.fileName("photo.jpg")).isEqualTo("photo.jpg")
    }

    @Test
    fun fileName_blank_fallsBackToDefault() {
        assertThat(MediaUpload.fileName("")).isEqualTo(MediaUpload.DEFAULT_FILE_NAME)
        assertThat(MediaUpload.fileName("   ")).isEqualTo(MediaUpload.DEFAULT_FILE_NAME)
    }

    @Test
    fun mimeType_nonBlank_passesThrough() {
        assertThat(MediaUpload.mimeType("video/mp4")).isEqualTo("video/mp4")
    }

    @Test
    fun mimeType_blank_fallsBackToOctetStream() {
        assertThat(MediaUpload.mimeType("")).isEqualTo(DEFAULT_MEDIA_MIME_TYPE)
        assertThat(MediaUpload.mimeType("  ")).isEqualTo(DEFAULT_MEDIA_MIME_TYPE)
    }

    @Test
    fun formPart_usesFilesFieldNameAndResolvedFilename() {
        val part = MediaUpload.formPart(
            MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = "clip.mp4", mimeType = "video/mp4"),
        )

        val disposition = part.headers?.get("Content-Disposition").orEmpty()
        assertThat(disposition).contains("name=\"${MediaUpload.FIELD_NAME}\"")
        assertThat(disposition).contains("filename=\"clip.mp4\"")
    }

    @Test
    fun formPart_blankFilename_advertisesDefault() {
        val part = MediaUpload.formPart(
            MediaUploadItem(bytes = byteArrayOf(0), fileName = "", mimeType = "image/png"),
        )

        assertThat(part.headers?.get("Content-Disposition").orEmpty())
            .contains("filename=\"${MediaUpload.DEFAULT_FILE_NAME}\"")
    }

    @Test
    fun formPart_setsResolvedContentTypeOnBody() {
        val part = MediaUpload.formPart(
            MediaUploadItem(bytes = byteArrayOf(7, 8), fileName = "a.png", mimeType = "image/png"),
        )

        assertThat(part.body.contentType().toString()).isEqualTo("image/png")
    }

    @Test
    fun formPart_blankMime_setsOctetStreamContentType() {
        val part = MediaUpload.formPart(
            MediaUploadItem(bytes = byteArrayOf(7), fileName = "blob", mimeType = ""),
        )

        assertThat(part.body.contentType().toString()).isEqualTo(DEFAULT_MEDIA_MIME_TYPE)
    }

    @Test
    fun formPart_carriesByteCountInBody() {
        val part = MediaUpload.formPart(
            MediaUploadItem(bytes = byteArrayOf(1, 2, 3, 4, 5), fileName = "f", mimeType = "image/jpeg"),
        )

        assertThat(part.body.contentLength()).isEqualTo(5L)
    }
}
