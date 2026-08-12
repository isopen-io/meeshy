package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for the pure OpenGraph / link-detection core. Every branch of
 * URL detection, tracker canonicalisation, HTML metadata parsing and entity decoding is
 * driven through the public API — no reflection, no implementation coupling.
 */
class LinkPreviewParserTest {

    // region firstUrl — detection

    @Test
    fun `firstUrl returns null for empty text`() {
        assertThat(LinkPreviewParser.firstUrl("")).isNull()
    }

    @Test
    fun `firstUrl returns null for blank text`() {
        assertThat(LinkPreviewParser.firstUrl("   \n\t ")).isNull()
    }

    @Test
    fun `firstUrl returns null when there is no link`() {
        assertThat(LinkPreviewParser.firstUrl("just a plain sentence with no link")).isNull()
    }

    @Test
    fun `firstUrl ignores mailto and tel schemes`() {
        assertThat(LinkPreviewParser.firstUrl("write to mailto:a@b.com or call tel:+15551234")).isNull()
    }

    @Test
    fun `firstUrl extracts an https url embedded in a sentence`() {
        assertThat(LinkPreviewParser.firstUrl("check https://example.com/path out"))
            .isEqualTo("https://example.com/path")
    }

    @Test
    fun `firstUrl extracts an http url`() {
        assertThat(LinkPreviewParser.firstUrl("http://example.com works too"))
            .isEqualTo("http://example.com")
    }

    @Test
    fun `firstUrl keeps query string intact`() {
        assertThat(LinkPreviewParser.firstUrl("see https://x.com/p?a=1&b=2 now"))
            .isEqualTo("https://x.com/p?a=1&b=2")
    }

    @Test
    fun `firstUrl strips a trailing sentence period`() {
        assertThat(LinkPreviewParser.firstUrl("Visit https://example.com."))
            .isEqualTo("https://example.com")
    }

    @Test
    fun `firstUrl strips several trailing punctuation marks`() {
        assertThat(LinkPreviewParser.firstUrl("wow https://example.com?!"))
            .isEqualTo("https://example.com")
    }

    @Test
    fun `firstUrl strips an unbalanced trailing close paren`() {
        assertThat(LinkPreviewParser.firstUrl("(see https://example.com)"))
            .isEqualTo("https://example.com")
    }

    @Test
    fun `firstUrl keeps a balanced paren inside the url`() {
        assertThat(LinkPreviewParser.firstUrl("read https://en.wikipedia.org/wiki/Foo_(bar) please"))
            .isEqualTo("https://en.wikipedia.org/wiki/Foo_(bar)")
    }

    @Test
    fun `firstUrl strips a trailing angle bracket`() {
        assertThat(LinkPreviewParser.firstUrl("link <https://example.com>"))
            .isEqualTo("https://example.com")
    }

    @Test
    fun `firstUrl normalises a bare www host to https`() {
        assertThat(LinkPreviewParser.firstUrl("go to www.example.com today"))
            .isEqualTo("https://www.example.com")
    }

    @Test
    fun `firstUrl lowercases the scheme`() {
        assertThat(LinkPreviewParser.firstUrl("HTTPS://Example.com/Path"))
            .isEqualTo("https://Example.com/Path")
    }

    @Test
    fun `firstUrl ignores a scheme that trims to an empty host`() {
        assertThat(LinkPreviewParser.firstUrl("broken http://. here")).isNull()
    }

    @Test
    fun `firstUrl ignores a bare www that trims to nothing`() {
        assertThat(LinkPreviewParser.firstUrl("oops www., moving on")).isNull()
    }

    @Test
    fun `firstUrl returns the first of several urls`() {
        assertThat(LinkPreviewParser.firstUrl("https://one.com and https://two.com"))
            .isEqualTo("https://one.com")
    }

    @Test
    fun `firstUrl handles a url at the very start`() {
        assertThat(LinkPreviewParser.firstUrl("https://start.com is first"))
            .isEqualTo("https://start.com")
    }

    @Test
    fun `firstUrl handles a url at the very end`() {
        assertThat(LinkPreviewParser.firstUrl("ending on https://end.com"))
            .isEqualTo("https://end.com")
    }

    // endregion

    // region canonicalize — tracker stripping

    @Test
    fun `canonicalize strips a utm_source param`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p?utm_source=news&id=5"))
            .isEqualTo("https://x.com/p?id=5")
    }

    @Test
    fun `canonicalize strips every known tracker param`() {
        val url = "https://x.com/p?utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&" +
            "utm_content=e&fbclid=f&gclid=g&keep=1"
        assertThat(LinkPreviewParser.canonicalize(url)).isEqualTo("https://x.com/p?keep=1")
    }

    @Test
    fun `canonicalize matches tracker names case-insensitively`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p?UTM_Source=a&id=5"))
            .isEqualTo("https://x.com/p?id=5")
    }

    @Test
    fun `canonicalize drops the query entirely when only trackers remain`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p?utm_source=a&fbclid=b"))
            .isEqualTo("https://x.com/p")
    }

    @Test
    fun `canonicalize preserves the order of the remaining params`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p?a=1&utm_source=z&b=2&c=3"))
            .isEqualTo("https://x.com/p?a=1&b=2&c=3")
    }

    @Test
    fun `canonicalize leaves a url without a query untouched`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p"))
            .isEqualTo("https://x.com/p")
    }

    @Test
    fun `canonicalize leaves a url whose only params are non-trackers`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p?id=5&ref=home"))
            .isEqualTo("https://x.com/p?id=5&ref=home")
    }

    @Test
    fun `canonicalize drops an empty fragment`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p#"))
            .isEqualTo("https://x.com/p")
    }

    @Test
    fun `canonicalize keeps a real fragment`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p#section"))
            .isEqualTo("https://x.com/p#section")
    }

    @Test
    fun `canonicalize keeps the fragment after stripping trackers`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p?utm_source=a#s"))
            .isEqualTo("https://x.com/p#s")
    }

    @Test
    fun `canonicalize keeps a valueless param that is not a tracker`() {
        assertThat(LinkPreviewParser.canonicalize("https://x.com/p?flag&id=5"))
            .isEqualTo("https://x.com/p?flag&id=5")
    }

    // endregion

    // region parse — OpenGraph extraction

    @Test
    fun `parse reads og title description image and site name`() {
        val html = """
            <meta property="og:title" content="Hello World">
            <meta property="og:description" content="A nice page">
            <meta property="og:image" content="https://cdn.x.com/img.png">
            <meta property="og:site_name" content="X Site">
        """.trimIndent()
        val meta = LinkPreviewParser.parse(html, "https://x.com/p")
        assertThat(meta.title).isEqualTo("Hello World")
        assertThat(meta.description).isEqualTo("A nice page")
        assertThat(meta.imageUrl).isEqualTo("https://cdn.x.com/img.png")
        assertThat(meta.siteName).isEqualTo("X Site")
        assertThat(meta.hasAnyVisibleField).isTrue()
    }

    @Test
    fun `parse falls back to the title tag when og title is absent`() {
        val meta = LinkPreviewParser.parse("<title>Doc Title</title>", "https://x.com/p")
        assertThat(meta.title).isEqualTo("Doc Title")
    }

    @Test
    fun `parse reads a twitter card title`() {
        val meta = LinkPreviewParser.parse(
            """<meta name="twitter:title" content="Tweet Title">""",
            "https://x.com/p",
        )
        assertThat(meta.title).isEqualTo("Tweet Title")
    }

    @Test
    fun `parse accepts content declared before property`() {
        val meta = LinkPreviewParser.parse(
            """<meta content="Reversed" property="og:title">""",
            "https://x.com/p",
        )
        assertThat(meta.title).isEqualTo("Reversed")
    }

    @Test
    fun `parse resolves a root-relative image against the origin`() {
        val meta = LinkPreviewParser.parse(
            """<meta property="og:image" content="/img/hero.png">""",
            "https://x.com/blog/post",
        )
        assertThat(meta.imageUrl).isEqualTo("https://x.com/img/hero.png")
    }

    @Test
    fun `parse resolves a protocol-relative image using the page scheme`() {
        val meta = LinkPreviewParser.parse(
            """<meta property="og:image" content="//cdn.x.com/a.png">""",
            "https://x.com/p",
        )
        assertThat(meta.imageUrl).isEqualTo("https://cdn.x.com/a.png")
    }

    @Test
    fun `parse resolves a path-relative image against the page directory`() {
        val meta = LinkPreviewParser.parse(
            """<meta property="og:image" content="hero.png">""",
            "https://x.com/blog/post",
        )
        assertThat(meta.imageUrl).isEqualTo("https://x.com/blog/hero.png")
    }

    @Test
    fun `parse keeps an already-absolute image url`() {
        val meta = LinkPreviewParser.parse(
            """<meta property="og:image" content="https://other.com/a.png">""",
            "https://x.com/p",
        )
        assertThat(meta.imageUrl).isEqualTo("https://other.com/a.png")
    }

    @Test
    fun `parse falls back to the host for site name when none declared`() {
        val meta = LinkPreviewParser.parse("<title>Only Title</title>", "https://news.x.com/p")
        assertThat(meta.siteName).isEqualTo("news.x.com")
    }

    @Test
    fun `parse decodes html entities in extracted fields`() {
        val meta = LinkPreviewParser.parse(
            """<meta property="og:title" content="Ben &amp; Jerry&#39;s">""",
            "https://x.com/p",
        )
        assertThat(meta.title).isEqualTo("Ben & Jerry's")
    }

    @Test
    fun `parse reports no visible field when only a host-derived site name exists`() {
        val meta = LinkPreviewParser.parse("<html><body>no meta here</body></html>", "https://x.com/p")
        assertThat(meta.title).isNull()
        assertThat(meta.description).isNull()
        assertThat(meta.imageUrl).isNull()
        assertThat(meta.siteName).isEqualTo("x.com")
        assertThat(meta.hasAnyVisibleField).isFalse()
    }

    @Test
    fun `parse ignores the fragment when deriving the host site name`() {
        val meta = LinkPreviewParser.parse("<title>t</title>", "https://x.com:8443/p?q=1#frag")
        assertThat(meta.siteName).isEqualTo("x.com")
    }

    // endregion

    // region decodeHtmlEntities

    @Test
    fun `decode handles the common named entities`() {
        assertThat(LinkPreviewParser.decodeHtmlEntities("a &amp; b &lt; c &gt; d &quot;e&quot;"))
            .isEqualTo("""a & b < c > d "e"""")
    }

    @Test
    fun `decode handles non-breaking space and dashes`() {
        assertThat(LinkPreviewParser.decodeHtmlEntities("x&nbsp;y &mdash; z &ndash; w &hellip;"))
            .isEqualTo("x y — z – w …")
    }

    @Test
    fun `decode handles a decimal numeric entity`() {
        assertThat(LinkPreviewParser.decodeHtmlEntities("copyright &#169; 2026")).isEqualTo("copyright © 2026")
    }

    @Test
    fun `decode handles a hex numeric entity`() {
        assertThat(LinkPreviewParser.decodeHtmlEntities("mark &#x00AE; here")).isEqualTo("mark ® here")
    }

    @Test
    fun `decode trims surrounding whitespace`() {
        assertThat(LinkPreviewParser.decodeHtmlEntities("  padded  ")).isEqualTo("padded")
    }

    @Test
    fun `decode leaves an out-of-range numeric entity intact`() {
        assertThat(LinkPreviewParser.decodeHtmlEntities("bad &#x200000; end"))
            .isEqualTo("bad &#x200000; end")
    }

    @Test
    fun `decode leaves an unknown entity untouched`() {
        assertThat(LinkPreviewParser.decodeHtmlEntities("keep &unknownentity; intact"))
            .isEqualTo("keep &unknownentity; intact")
    }

    // endregion

    // region LinkMetadata derived surface

    @Test
    fun `metadata host is derived from the canonical id`() {
        val meta = LinkMetadata(id = "https://sub.x.com/a/b", title = "t")
        assertThat(meta.host).isEqualTo("sub.x.com")
    }

    @Test
    fun `metadata host is null for an unparseable id`() {
        assertThat(LinkMetadata(id = "not a url").host).isNull()
    }

    @Test
    fun `metadata hasAnyVisibleField is true when only an image exists`() {
        assertThat(LinkMetadata(id = "https://x.com", imageUrl = "https://x.com/a.png").hasAnyVisibleField)
            .isTrue()
    }

    @Test
    fun `metadata hasAnyVisibleField ignores a blank title`() {
        assertThat(LinkMetadata(id = "https://x.com", title = "  ").hasAnyVisibleField).isFalse()
    }

    // endregion
}
