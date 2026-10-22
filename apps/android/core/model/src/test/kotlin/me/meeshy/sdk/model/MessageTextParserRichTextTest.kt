package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.text.WrittenLink
import org.junit.Test

/** The rich-text law beyond emphasis: code, links as written, hashtags, valid pseudos. */
class MessageTextParserRichTextTest {

    private val parse = MessageTextParser::parse
    private val bi = TextStyles(bold = true, italic = true)

    @Test fun `triple stars give bold italic`() {
        assertThat(parse("***mot***", null, null)).containsExactly(MessageSegment.Text("mot", bi))
    }

    @Test fun `inline code is literal`() {
        assertThat(parse("a `**x** @y` b", null, null)).containsExactly(
            MessageSegment.Text("a "),
            MessageSegment.Code("**x** @y"),
            MessageSegment.Text(" b"),
        ).inOrder()
    }

    @Test fun `markdown link keeps label and address`() {
        assertThat(parse("[doc](https://x.fr/a_(b))", null, null))
            .containsExactly(MessageSegment.Link(WrittenLink.Labelled("doc", "https://x.fr/a_(b)")))
        assertThat(parse("[m](mailto:a@b.fr)", null, null))
            .containsExactly(MessageSegment.Link(WrittenLink.Labelled("m", "mailto:a@b.fr")))
    }

    @Test fun `a javascript target never becomes a link`() {
        assertThat(parse("[x](javascript:alert(1))", null, null).none { it is MessageSegment.Link }).isTrue()
    }

    @Test fun `double brackets open the address directly`() {
        assertThat(parse("[[https://x.fr/a]]", null, null))
            .containsExactly(MessageSegment.Link(WrittenLink.Verbatim("https://x.fr/a", "https://x.fr/a")))
    }

    @Test fun `www becomes https and returns closing punctuation to the prose`() {
        assertThat(parse("voir www.exemple.com/a.", null, null)).containsExactly(
            MessageSegment.Text("voir "),
            MessageSegment.Link(WrittenLink.Bare("www.exemple.com/a", "https://www.exemple.com/a")),
            MessageSegment.Text("."),
        ).inOrder()
    }

    @Test fun `an e-mail becomes mailto`() {
        assertThat(parse("écris a.b@c.fr", null, null)).containsExactly(
            MessageSegment.Text("écris "),
            MessageSegment.Link(WrittenLink.Verbatim("a.b@c.fr", "mailto:a.b@c.fr")),
        ).inOrder()
    }

    @Test fun `a hashtag links to its lowercased page`() {
        assertThat(parse("vive #Paris!", null, null)).containsExactly(
            MessageSegment.Text("vive "),
            MessageSegment.HashtagLink("#Paris", "paris", "https://meeshy.me/hashtag/paris"),
            MessageSegment.Text("!"),
        ).inOrder()
    }

    @Test fun `hashtag needs a clean left edge`() {
        assertThat(parse("C#paris", null, null).none { it is MessageSegment.HashtagLink }).isTrue()
        assertThat(parse("exemple.com/#section", null, null).none { it is MessageSegment.HashtagLink }).isTrue()
        assertThat(parse("# Titre", null, null).none { it is MessageSegment.HashtagLink }).isTrue()
    }

    @Test fun `a mention keeps its hyphen`() {
        assertThat(parse("@marie-claire", null, null))
            .containsExactly(MessageSegment.MentionLink("@marie-claire", "marie-claire", "https://meeshy.me/u/marie-claire"))
    }

    @Test fun `only real pseudos become links when the set is given`() {
        val segments = parse("@ata et @inconnu", null, setOf("ata"))
        assertThat(segments).containsExactly(
            MessageSegment.MentionLink("@ata", "ata", "https://meeshy.me/u/ata"),
            MessageSegment.Text(" et "),
            MessageSegment.Text("@inconnu"),
        ).inOrder()
        assertThat(parse("@ata", null, emptySet()).none { it is MessageSegment.MentionLink }).isTrue()
    }

    @Test fun `validated set applies inside emphasis too`() {
        val segments = parse("**@ghost**", null, emptySet())
        assertThat(segments).containsExactly(MessageSegment.Text("@ghost", TextStyles(bold = true)))
    }

    @Test fun `a raw url still parses as before`() {
        assertThat(parse("https://x.fr/a", null, null)).containsExactly(MessageSegment.UrlLink("https://x.fr/a", "https://x.fr/a"))
    }
}
