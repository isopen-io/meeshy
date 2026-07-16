package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [MimeTypeResolver] — the Android port of the iOS
 * `MimeTypeResolver` SSOT (MeeshySDK `Utils/MimeTypeResolver.swift`). Pins the
 * extension ↔ mime forward/reverse tables and the picked-attachment
 * [MimeTypeResolver.resolve] chooser (declared content-type first, filename
 * extension as fallback) so a drift from the iOS table is caught immediately.
 */
class MimeTypeResolverTest {

    // MARK: - mimeType(forExtension)

    @Test
    fun a_known_extension_maps_to_its_canonical_mime() {
        assertThat(MimeTypeResolver.mimeTypeForExtension("jpg")).isEqualTo("image/jpeg")
        assertThat(MimeTypeResolver.mimeTypeForExtension("pdf")).isEqualTo("application/pdf")
        assertThat(MimeTypeResolver.mimeTypeForExtension("mp4")).isEqualTo("video/mp4")
        assertThat(MimeTypeResolver.mimeTypeForExtension("mp3")).isEqualTo("audio/mpeg")
    }

    @Test
    fun extension_lookup_is_case_insensitive() {
        assertThat(MimeTypeResolver.mimeTypeForExtension("JPEG")).isEqualTo("image/jpeg")
        assertThat(MimeTypeResolver.mimeTypeForExtension("HEIC")).isEqualTo("image/heic")
    }

    @Test
    fun a_leading_dot_on_the_extension_is_stripped() {
        assertThat(MimeTypeResolver.mimeTypeForExtension(".png")).isEqualTo("image/png")
        assertThat(MimeTypeResolver.mimeTypeForExtension(".docx"))
            .isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    }

    @Test
    fun synonym_extensions_share_the_canonical_mime() {
        assertThat(MimeTypeResolver.mimeTypeForExtension("jpeg")).isEqualTo("image/jpeg")
        assertThat(MimeTypeResolver.mimeTypeForExtension("m4v")).isEqualTo("video/mp4")
        assertThat(MimeTypeResolver.mimeTypeForExtension("heif")).isEqualTo("image/heic")
        assertThat(MimeTypeResolver.mimeTypeForExtension("oga")).isEqualTo("audio/ogg")
    }

    @Test
    fun an_unknown_extension_falls_back_to_octet_stream() {
        assertThat(MimeTypeResolver.mimeTypeForExtension("xyz"))
            .isEqualTo("application/octet-stream")
    }

    @Test
    fun an_empty_extension_falls_back_to_octet_stream() {
        assertThat(MimeTypeResolver.mimeTypeForExtension("")).isEqualTo("application/octet-stream")
    }

    // MARK: - mimeType(forFilename)

    @Test
    fun a_filename_resolves_via_its_last_extension() {
        assertThat(MimeTypeResolver.mimeTypeForFilename("report.xlsx"))
            .isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        assertThat(MimeTypeResolver.mimeTypeForFilename("photo.HEIC")).isEqualTo("image/heic")
    }

    @Test
    fun a_multi_dot_filename_uses_only_the_final_extension() {
        assertThat(MimeTypeResolver.mimeTypeForFilename("archive.tar.gz")).isEqualTo("application/gzip")
    }

    @Test
    fun a_filename_without_an_extension_falls_back_to_octet_stream() {
        assertThat(MimeTypeResolver.mimeTypeForFilename("noext")).isEqualTo("application/octet-stream")
    }

    @Test
    fun a_filename_ending_in_a_bare_dot_falls_back_to_octet_stream() {
        assertThat(MimeTypeResolver.mimeTypeForFilename("trailing.")).isEqualTo("application/octet-stream")
    }

    // MARK: - preferredExtension(for)

    @Test
    fun a_known_mime_maps_back_to_its_preferred_extension() {
        assertThat(MimeTypeResolver.preferredExtensionForMime("image/jpeg")).isEqualTo("jpg")
        assertThat(MimeTypeResolver.preferredExtensionForMime("audio/mp4")).isEqualTo("m4a")
        assertThat(MimeTypeResolver.preferredExtensionForMime("application/pdf")).isEqualTo("pdf")
    }

    @Test
    fun reverse_lookup_is_case_insensitive() {
        assertThat(MimeTypeResolver.preferredExtensionForMime("IMAGE/PNG")).isEqualTo("png")
    }

    @Test
    fun an_uncovered_mime_has_no_preferred_extension() {
        assertThat(MimeTypeResolver.preferredExtensionForMime("application/unknown")).isNull()
    }

    // MARK: - resolve(declaredType, fileName) — the picked-attachment chooser

    @Test
    fun a_meaningful_declared_type_wins_over_the_filename() {
        assertThat(MimeTypeResolver.resolve(declaredType = "image/png", fileName = "x.jpg"))
            .isEqualTo("image/png")
    }

    @Test
    fun an_octet_stream_declared_type_defers_to_the_filename() {
        assertThat(MimeTypeResolver.resolve(declaredType = "application/octet-stream", fileName = "x.pdf"))
            .isEqualTo("application/pdf")
    }

    @Test
    fun octet_stream_detection_is_case_insensitive() {
        assertThat(MimeTypeResolver.resolve(declaredType = "APPLICATION/OCTET-STREAM", fileName = "a.png"))
            .isEqualTo("image/png")
    }

    @Test
    fun a_null_declared_type_defers_to_the_filename() {
        assertThat(MimeTypeResolver.resolve(declaredType = null, fileName = "clip.mp4"))
            .isEqualTo("video/mp4")
    }

    @Test
    fun a_blank_declared_type_defers_to_the_filename() {
        assertThat(MimeTypeResolver.resolve(declaredType = "   ", fileName = "doc.docx"))
            .isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    }

    @Test
    fun a_declared_type_is_trimmed_before_use() {
        assertThat(MimeTypeResolver.resolve(declaredType = "  image/gif  ", fileName = "x.bin"))
            .isEqualTo("image/gif")
    }

    @Test
    fun both_declared_and_filename_unknown_falls_back_to_octet_stream() {
        assertThat(MimeTypeResolver.resolve(declaredType = null, fileName = "mystery"))
            .isEqualTo("application/octet-stream")
    }
}
