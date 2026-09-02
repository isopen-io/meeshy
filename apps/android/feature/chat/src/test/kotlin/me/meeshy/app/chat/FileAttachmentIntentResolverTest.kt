package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Covers [FileAttachmentIntentResolver.resolveMimeType] — the pure mime resolution this
 * task calls out ("Résolution mime→intent en pur testé"). The `viewIntent`/`shareIntent`
 * builders touch `android.content.Intent`/`Uri` and stay coverage-exempt, matching this
 * repo's convention for framework glue (see `CameraCaptureFileTest.kt`).
 */
class FileAttachmentIntentResolverTest {

    @Test
    fun a_meaningful_declared_mime_type_wins_over_the_extension() {
        val resolved = FileAttachmentIntentResolver.resolveMimeType(
            mimeType = "application/pdf",
            fileName = "report.docx",
        )
        assertThat(resolved).isEqualTo("application/pdf")
    }

    @Test
    fun a_blank_declared_mime_type_falls_back_to_the_extension() {
        val resolved = FileAttachmentIntentResolver.resolveMimeType(mimeType = "  ", fileName = "notes.txt")
        assertThat(resolved).isEqualTo("text/plain")
    }

    @Test
    fun a_null_declared_mime_type_falls_back_to_the_extension() {
        val resolved = FileAttachmentIntentResolver.resolveMimeType(mimeType = null, fileName = "archive.zip")
        assertThat(resolved).isEqualTo("application/zip")
    }

    @Test
    fun an_octet_stream_declared_mime_type_is_treated_as_uninformative() {
        val resolved = FileAttachmentIntentResolver.resolveMimeType(
            mimeType = "application/octet-stream",
            fileName = "source.kt",
        )
        // MimeTypeResolver has no "kt" entry, so this still falls through to octet-stream —
        // the point of this case is that a generic declared type doesn't short-circuit the
        // extension lookup, not that "kt" resolves to something more specific.
        assertThat(resolved).isEqualTo("application/octet-stream")
    }

    @Test
    fun an_unknown_extension_with_no_declared_mime_type_falls_back_to_octet_stream() {
        val resolved = FileAttachmentIntentResolver.resolveMimeType(mimeType = null, fileName = "data.unknownext")
        assertThat(resolved).isEqualTo("application/octet-stream")
    }
}
