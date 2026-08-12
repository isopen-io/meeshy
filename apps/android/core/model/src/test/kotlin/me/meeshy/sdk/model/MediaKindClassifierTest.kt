package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure classification of a wire MIME type into the [MediaKind] the auto-download policy
 * applies to (feature-parity §L). The bridge between "this attachment is a `video/mp4`"
 * and the [MediaDownloadPolicyEngine] truth table. Anything not image/video/audio (a PDF,
 * a blank/absent type, a bare top-level token with no subtype) is deliberately
 * unclassifiable (`null`) so it is never auto-downloaded on the user's data.
 */
class MediaKindClassifierTest {

    @Test
    fun imageMime_classifiesAsImage() {
        assertThat(MediaKindClassifier.fromMimeType("image/png")).isEqualTo(MediaKind.IMAGE)
        assertThat(MediaKindClassifier.fromMimeType("image/jpeg")).isEqualTo(MediaKind.IMAGE)
    }

    @Test
    fun videoMime_classifiesAsVideo() {
        assertThat(MediaKindClassifier.fromMimeType("video/mp4")).isEqualTo(MediaKind.VIDEO)
    }

    @Test
    fun audioMime_withoutTranslationFlag_classifiesAsAudio() {
        assertThat(MediaKindClassifier.fromMimeType("audio/mpeg")).isEqualTo(MediaKind.AUDIO)
    }

    @Test
    fun audioMime_withTranslationFlag_classifiesAsAudioTranslation() {
        assertThat(
            MediaKindClassifier.fromMimeType("audio/mpeg", isAudioTranslation = true),
        ).isEqualTo(MediaKind.AUDIO_TRANSLATION)
    }

    @Test
    fun translationFlag_isIgnoredForNonAudio() {
        // A translation flag only distinguishes audio vs audio-translation; it must not
        // reclassify an image or video.
        assertThat(
            MediaKindClassifier.fromMimeType("image/png", isAudioTranslation = true),
        ).isEqualTo(MediaKind.IMAGE)
        assertThat(
            MediaKindClassifier.fromMimeType("video/mp4", isAudioTranslation = true),
        ).isEqualTo(MediaKind.VIDEO)
    }

    @Test
    fun caseIsFolded() {
        assertThat(MediaKindClassifier.fromMimeType("IMAGE/PNG")).isEqualTo(MediaKind.IMAGE)
        assertThat(MediaKindClassifier.fromMimeType("Audio/OGG")).isEqualTo(MediaKind.AUDIO)
    }

    @Test
    fun structuredParameter_afterSemicolon_isStripped() {
        assertThat(
            MediaKindClassifier.fromMimeType("audio/mpeg; codecs=opus"),
        ).isEqualTo(MediaKind.AUDIO)
        assertThat(
            MediaKindClassifier.fromMimeType("video/mp4;codecs=\"avc1\""),
        ).isEqualTo(MediaKind.VIDEO)
    }

    @Test
    fun surroundingWhitespace_isTrimmed() {
        assertThat(MediaKindClassifier.fromMimeType("  video/webm  ")).isEqualTo(MediaKind.VIDEO)
    }

    @Test
    fun nullMime_isUnclassifiable() {
        assertThat(MediaKindClassifier.fromMimeType(null)).isNull()
    }

    @Test
    fun blankMime_isUnclassifiable() {
        assertThat(MediaKindClassifier.fromMimeType("")).isNull()
        assertThat(MediaKindClassifier.fromMimeType("   ")).isNull()
    }

    @Test
    fun nonMediaMime_isUnclassifiable() {
        assertThat(MediaKindClassifier.fromMimeType("application/pdf")).isNull()
        assertThat(MediaKindClassifier.fromMimeType("text/plain")).isNull()
    }

    @Test
    fun topLevelTypeWithoutSubtype_isUnclassifiable() {
        // "image" is not "image/…"; an incomplete type is not trusted enough to
        // spend the user's data on.
        assertThat(MediaKindClassifier.fromMimeType("image")).isNull()
        assertThat(MediaKindClassifier.fromMimeType("audio")).isNull()
    }

    @Test
    fun typeWithTrailingSlashButNoSubtype_stillClassifiesByTopLevel() {
        // "audio/" starts with "audio/" — the top-level type is unambiguous even with an
        // empty subtype, so it classifies (a lenient-but-safe boundary).
        assertThat(MediaKindClassifier.fromMimeType("audio/")).isEqualTo(MediaKind.AUDIO)
    }
}
