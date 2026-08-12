package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure URI builder for a Quick Reply tap — `meeshy://conversation/{id}?draft={text}`,
 * consumed by [me.meeshy.app.chat.ChatViewModel]'s `initialDraft` (`java.net.URLDecoder`
 * on that end, see its own `NOTES.md` entry for why `android.net.Uri` is avoided in
 * JVM-unit-tested code — `java.net.URLEncoder` here is the matching, equally
 * JVM-testable counterpart).
 */
class QuickReplyDeepLinkTest {

    @Test
    fun `builds a plain-text draft URI`() {
        assertThat(QuickReplyDeepLink.uri("c1", "OK")).isEqualTo("meeshy://conversation/c1?draft=OK")
    }

    @Test
    fun `encodes spaces in the draft text`() {
        assertThat(QuickReplyDeepLink.uri("c1", "Call me")).isEqualTo("meeshy://conversation/c1?draft=Call+me")
    }

    @Test
    fun `encodes a literal plus sign so it never round-trips as a space`() {
        assertThat(QuickReplyDeepLink.uri("c1", "a+b")).isEqualTo("meeshy://conversation/c1?draft=a%2Bb")
    }

    @Test
    fun `encodes emoji`() {
        assertThat(QuickReplyDeepLink.uri("c1", "👍")).isEqualTo("meeshy://conversation/c1?draft=%F0%9F%91%8D")
    }

    @Test
    fun `embeds the conversation id verbatim`() {
        assertThat(QuickReplyDeepLink.uri("conv-42", "OK")).startsWith("meeshy://conversation/conv-42?")
    }
}
