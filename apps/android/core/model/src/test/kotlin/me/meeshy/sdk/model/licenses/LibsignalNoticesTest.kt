package me.meeshy.sdk.model.licenses

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LibsignalNoticesTest {

    private val fence = "```"

    private val markdown = """
        |# Acknowledgments
        |
        |libsignal makes use of the following open source projects.
        |
        |## libsignal-protocol, zkgroup
        |
        |$fence
        |                    GNU AFFERO GENERAL PUBLIC LICENSE
        |   indented line kept as is
        |$fence
        |
        |## ring 0.17.14
        |
        |$fence
        |Apache License
        |$fence
        |
        |## heading without text
        |
    """.trimMargin()

    @Test
    fun parse_keepsEveryFencedNotice_inOrder() {
        val notices = LibsignalNotices.parse(markdown)
        assertThat(notices.map { it.title }).containsExactly("libsignal-protocol, zkgroup", "ring 0.17.14").inOrder()
    }

    @Test
    fun parse_keepsTheLicenseTextVerbatim() {
        val first = LibsignalNotices.parse(markdown).first()
        assertThat(first.text).isEqualTo("                    GNU AFFERO GENERAL PUBLIC LICENSE\n   indented line kept as is")
    }

    @Test
    fun parse_dropsHeadingsWithoutText() {
        assertThat(LibsignalNotices.parse(markdown).map { it.title }).doesNotContain("heading without text")
    }

    @Test
    fun parse_ofNothing_isEmpty() {
        assertThat(LibsignalNotices.parse("")).isEmpty()
    }

    @Test
    fun upstreamUrl_namesThePinnedTag() {
        assertThat(LibsignalNotices.UPSTREAM_ACKNOWLEDGMENTS_URL).contains("/v${LibsignalNotices.VERSION}/")
    }
}
