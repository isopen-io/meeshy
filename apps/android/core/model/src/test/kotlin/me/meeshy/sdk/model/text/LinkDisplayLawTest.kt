package me.meeshy.sdk.model.text

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LinkDisplayLawTest {

    private val origin = "https://staging.meeshy.me"
    private val map = mapOf("https://exemple.com/a" to "abc123")

    @Test fun `verbatim shows the address and opens it directly even when mapped`() {
        val link = WrittenLink.Verbatim("https://exemple.com/a", "https://exemple.com/a")
        val shown = LinkDisplayLaw.resolve(link, map, origin)
        assertThat(shown).isEqualTo(LinkDisplay("https://exemple.com/a", "https://exemple.com/a", isTracked = false))
    }

    @Test fun `a bare mapped url shows m plus token and opens the redirect of the active origin`() {
        val shown = LinkDisplayLaw.resolve(WrittenLink.Bare("https://exemple.com/a", "https://exemple.com/a"), map, origin)
        assertThat(shown.text).isEqualTo("m+abc123")
        assertThat(shown.url).isEqualTo("https://staging.meeshy.me/l/abc123")
        assertThat(shown.isTracked).isTrue()
    }

    @Test fun `trailing sentence punctuation goes back to the prose`() {
        val shown = LinkDisplayLaw.resolve(WrittenLink.Bare("https://exemple.com/a).", "https://exemple.com/a)."), map, origin)
        assertThat(shown.text).isEqualTo("m+abc123")
        assertThat(shown.remainder).isEqualTo(").")
    }

    @Test fun `a bare unmapped url stays as written and direct`() {
        val shown = LinkDisplayLaw.resolve(WrittenLink.Bare("https://autre.fr", "https://autre.fr"), map, origin)
        assertThat(shown).isEqualTo(LinkDisplay("https://autre.fr", "https://autre.fr", isTracked = false))
    }

    @Test fun `a labelled link keeps its label and tracks when mapped`() {
        val shown = LinkDisplayLaw.resolve(WrittenLink.Labelled("le site", "https://exemple.com/a"), map, origin)
        assertThat(shown.text).isEqualTo("le site")
        assertThat(shown.url).isEqualTo("https://staging.meeshy.me/l/abc123")
        val direct = LinkDisplayLaw.resolve(WrittenLink.Labelled("le site", "https://x.fr"), map, origin)
        assertThat(direct.url).isEqualTo("https://x.fr")
        assertThat(direct.isTracked).isFalse()
    }

    @Test fun `a short code opens the redirect`() {
        val shown = LinkDisplayLaw.resolve(WrittenLink.ShortCode("zz9"), null, origin)
        assertThat(shown).isEqualTo(LinkDisplay("m+zz9", "https://staging.meeshy.me/l/zz9", isTracked = true))
    }

    @Test fun `a token of the wrong shape is never trusted`() {
        val hostile = mapOf("https://exemple.com/a" to "../evil-")
        val shown = LinkDisplayLaw.resolve(WrittenLink.Bare("https://exemple.com/a", "https://exemple.com/a"), hostile, origin)
        assertThat(shown.isTracked).isFalse()
        assertThat(LinkDisplayLaw.isTrackingToken("abc-_9")).isTrue()
        assertThat(LinkDisplayLaw.isTrackingToken("abc-")).isFalse()
    }

    @Test fun `inert text keeps the notation and the address of a labelled link`() {
        assertThat(LinkDisplayLaw.inertText(WrittenLink.Labelled("doc", "https://x.fr"))).isEqualTo("[doc](https://x.fr)")
        assertThat(LinkDisplayLaw.inertText(WrittenLink.ShortCode("t1"))).isEqualTo("m+t1")
        assertThat(LinkDisplayLaw.inertText(WrittenLink.Verbatim("a@b.fr", "mailto:a@b.fr"))).isEqualTo("a@b.fr")
    }
}
