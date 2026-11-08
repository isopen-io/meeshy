package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageTextParserHashtagTest {
    private fun tags(text: String) = MessageTextParser.parse(text).filterIsInstance<MessageSegment.HashtagLink>().map { it.tag }

    @Test
    fun `un hashtag est un lien en minuscules`() {
        val link = MessageTextParser.parse("à #Paris").filterIsInstance<MessageSegment.HashtagLink>().single()
        assertThat(link.display).isEqualTo("#Paris")
        assertThat(link.url).isEqualTo("https://meeshy.me/hashtag/paris")
    }

    @Test
    fun `la ponctuation finale n entre pas dans le tag`() {
        assertThat(tags("super #fete, #été! et #x.")).containsExactly("fete", "été", "x").inOrder()
    }

    @Test
    fun `un fragment d URL n est pas un hashtag et l URL n est pas coupee`() {
        val segments = MessageTextParser.parse("voir https://exemple.com/page#section fin")
        assertThat(segments.filterIsInstance<MessageSegment.HashtagLink>()).isEmpty()
        assertThat(segments.filterIsInstance<MessageSegment.UrlLink>().single().display)
            .isEqualTo("https://exemple.com/page#section")
    }

    @Test
    fun `un titre markdown n est pas un hashtag`() {
        assertThat(tags("# Titre")).isEmpty()
    }

    @Test
    fun `une mention est validee contre la liste du post`() {
        val segments = MessageTextParser.parse("@alice @bob", validUsernames = setOf("alice"))
        assertThat(segments.filterIsInstance<MessageSegment.MentionLink>().map { it.username }).containsExactly("alice")
    }
}
