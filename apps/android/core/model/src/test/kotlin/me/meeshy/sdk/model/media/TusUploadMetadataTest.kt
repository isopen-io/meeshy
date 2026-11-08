package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Base64

/**
 * Behavioural coverage of [TusUploadMetadata.headerValue] — the pure builder of the
 * TUS `Upload-Metadata` header value the gateway's `@tus/server` (`onUploadCreate`/
 * `onUploadFinish`, `services/gateway/src/routes/uploads/tus-handler.ts`) parses.
 * Mirrors iOS `TusUploadManager.postCreateUpload`'s inline construction byte-for-byte
 * (`filename <b64>,filetype <b64>,uploadcontext <b64>`) so the two clients speak the
 * exact same wire format against the shared server.
 */
class TusUploadMetadataTest {

    private fun decode(b64: String): String = String(Base64.getDecoder().decode(b64))

    @Test
    fun `encodes filename, filetype and uploadcontext as base64 pairs joined by commas`() {
        val value = TusUploadMetadata.headerValue(
            fileName = "story.jpg",
            mimeType = "image/jpeg",
            context = TusUploadContext.STORY,
        )

        val pairs = value.split(",").associate { pair ->
            val (key, b64) = pair.split(" ", limit = 2)
            key to b64
        }

        assertThat(pairs.keys).containsExactly("filename", "filetype", "uploadcontext")
        assertThat(decode(pairs.getValue("filename"))).isEqualTo("story.jpg")
        assertThat(decode(pairs.getValue("filetype"))).isEqualTo("image/jpeg")
        assertThat(decode(pairs.getValue("uploadcontext"))).isEqualTo("story")
    }

    @Test
    fun `key order is filename, filetype, uploadcontext`() {
        val value = TusUploadMetadata.headerValue(
            fileName = "a.png",
            mimeType = "image/png",
            context = TusUploadContext.POST,
        )

        val keysInOrder = value.split(",").map { it.substringBefore(" ") }

        assertThat(keysInOrder).containsExactly("filename", "filetype", "uploadcontext").inOrder()
    }

    @Test
    fun `every TusUploadContext encodes to its exact gateway wire string`() {
        val expectations = mapOf(
            TusUploadContext.POST to "post",
            TusUploadContext.STORY to "story",
            TusUploadContext.STATUS to "status",
            TusUploadContext.COMMENT to "comment",
        )

        expectations.forEach { (context, wire) ->
            val value = TusUploadMetadata.headerValue("f", "m", context)
            val encodedContext = value.split(",").last().substringAfter(" ")
            assertThat(decode(encodedContext)).isEqualTo(wire)
        }
    }

    @Test
    fun `special characters in filename survive the base64 round trip`() {
        val value = TusUploadMetadata.headerValue(
            fileName = "IMG 2026, été (1).jpg",
            mimeType = "image/jpeg",
            context = TusUploadContext.STORY,
        )

        val encodedFilename = value.split(",").first().substringAfter(" ")

        assertThat(decode(encodedFilename)).isEqualTo("IMG 2026, été (1).jpg")
    }

    @Test
    fun `tus resumable version constant matches the protocol version the gateway server speaks`() {
        assertThat(TusUploadMetadata.TUS_RESUMABLE_VERSION).isEqualTo("1.0.0")
    }
}

class TusUploadMetadataDeclaredTest {
    private fun pairs(value: String) = value.split(",").associate { it.substringBefore(" ") to it.substringAfter(" ") }
    private fun decode(b64: String) = String(Base64.getDecoder().decode(b64))

    @Test
    fun `thumbhash and capturedinapp ride after uploadcontext, in the iOS order`() {
        val value = TusUploadMetadata.headerValue("v.mp4", "video/mp4", TusUploadContext.ATTACHMENT, thumbHash = "TH", capturedInApp = true)

        assertThat(value.split(",").map { it.substringBefore(" ") })
            .containsExactly("filename", "filetype", "uploadcontext", "thumbhash", "capturedinapp").inOrder()
        assertThat(decode(pairs(value).getValue("thumbhash"))).isEqualTo("TH")
        assertThat(decode(pairs(value).getValue("capturedinapp"))).isEqualTo("true")
    }

    @Test
    fun `the transcription is not encoded twice`() {
        val t = TusTranscription("salut", "fr")
        val value = TusUploadMetadata.headerValue("a.m4a", "audio/mp4", TusUploadContext.ATTACHMENT, transcription = t)

        assertThat(pairs(value).getValue("transcription")).isEqualTo(TusMetadataBudget.transcriptionValue(t))
    }

    @Test
    fun `an over-budget transcription leaves the voice upload otherwise intact`() {
        val t = TusTranscription("x".repeat(6_000), "fr")
        val value = TusUploadMetadata.headerValue("a.m4a", "audio/mp4", TusUploadContext.ATTACHMENT, transcription = t)

        assertThat(pairs(value).keys).containsExactly("filename", "filetype", "uploadcontext")
    }
}
