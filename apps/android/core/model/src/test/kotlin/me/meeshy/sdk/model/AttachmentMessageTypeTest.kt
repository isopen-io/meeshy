package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [AttachmentMessageType] — the coarse gateway
 * `messageType` label an attachment message carries, inferred from the
 * attachment's MIME. Ports the iOS inference in
 * `ConversationView+AttachmentHandlers.swift`
 * (`kind == .audio ? .audio : (mime.hasPrefix("video/") ? .video : .image)`)
 * generalised to the four wire labels, reusing [MediaKindClassifier] as the SSOT
 * for image/video/audio detection so there is no second copy of the MIME rules.
 */
class AttachmentMessageTypeTest {

    @Test
    fun an_image_mime_types_the_message_as_image() {
        assertThat(AttachmentMessageType.forMime("image/png")).isEqualTo("image")
    }

    @Test
    fun a_video_mime_types_the_message_as_video() {
        assertThat(AttachmentMessageType.forMime("video/mp4")).isEqualTo("video")
    }

    @Test
    fun an_audio_mime_types_the_message_as_audio() {
        assertThat(AttachmentMessageType.forMime("audio/mpeg")).isEqualTo("audio")
    }

    @Test
    fun a_document_mime_types_the_message_as_a_generic_file() {
        assertThat(AttachmentMessageType.forMime("application/pdf")).isEqualTo("file")
        assertThat(AttachmentMessageType.forMime("text/plain")).isEqualTo("file")
    }

    @Test
    fun a_mime_with_structured_parameters_is_classified_on_its_base_type() {
        assertThat(AttachmentMessageType.forMime("image/jpeg; charset=binary")).isEqualTo("image")
    }

    @Test
    fun classification_is_case_insensitive() {
        assertThat(AttachmentMessageType.forMime("IMAGE/PNG")).isEqualTo("image")
    }

    @Test
    fun a_null_mime_types_the_message_as_a_generic_file() {
        assertThat(AttachmentMessageType.forMime(null)).isEqualTo("file")
    }

    @Test
    fun a_blank_mime_types_the_message_as_a_generic_file() {
        assertThat(AttachmentMessageType.forMime("   ")).isEqualTo("file")
    }
}
