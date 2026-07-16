package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [ClipboardContent] — the app-local model that a large paste
 * is folded into (port of the iOS app-local `ClipboardContent` struct). The iOS
 * factory reads `Date()` twice for `id`/`createdAt`; the Android port injects the
 * clock so the value is pure and testable.
 */
class ClipboardContentTest {

    @Test
    fun `of records the full text verbatim`() {
        val text = "the quick brown fox"

        val clip = ClipboardContent.of(text, nowMillis = 1_000L)

        assertThat(clip.text).isEqualTo(text)
    }

    @Test
    fun `of counts the characters of the text`() {
        val clip = ClipboardContent.of("hello", nowMillis = 1_000L)

        assertThat(clip.charCount).isEqualTo(5)
    }

    @Test
    fun `of keeps a short text as its own preview with no ellipsis`() {
        val text = "short"

        val clip = ClipboardContent.of(text, nowMillis = 1_000L)

        assertThat(clip.truncatedPreview).isEqualTo("short")
    }

    @Test
    fun `of leaves a text exactly at the preview limit untruncated`() {
        val text = "a".repeat(ClipboardContent.PREVIEW_LIMIT)

        val clip = ClipboardContent.of(text, nowMillis = 1_000L)

        assertThat(clip.truncatedPreview).isEqualTo(text)
    }

    @Test
    fun `of truncates a text one over the limit to the prefix plus ellipsis`() {
        val text = "a".repeat(ClipboardContent.PREVIEW_LIMIT + 1)

        val clip = ClipboardContent.of(text, nowMillis = 1_000L)

        assertThat(clip.truncatedPreview)
            .isEqualTo("a".repeat(ClipboardContent.PREVIEW_LIMIT) + "...")
        assertThat(clip.charCount).isEqualTo(ClipboardContent.PREVIEW_LIMIT + 1)
    }

    @Test
    fun `of derives the id and created-at stamp from the injected clock`() {
        val clip = ClipboardContent.of("body", nowMillis = 1_699_000_000_123L)

        assertThat(clip.id).isEqualTo("clipboard-1699000000123")
        assertThat(clip.createdAtMillis).isEqualTo(1_699_000_000_123L)
    }

    @Test
    fun `two captures at the same instant with the same text are equal`() {
        val a = ClipboardContent.of("body", nowMillis = 42L)
        val b = ClipboardContent.of("body", nowMillis = 42L)

        assertThat(a).isEqualTo(b)
    }

    @Test
    fun `captures at different instants are distinct`() {
        val a = ClipboardContent.of("body", nowMillis = 42L)
        val b = ClipboardContent.of("body", nowMillis = 43L)

        assertThat(a).isNotEqualTo(b)
    }
}
