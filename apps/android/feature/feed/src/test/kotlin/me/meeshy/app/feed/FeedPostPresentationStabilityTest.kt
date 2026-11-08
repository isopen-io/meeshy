package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MentionedUser
import org.junit.Test

class FeedPostPresentationStabilityTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun build() = FeedPostBuilder.build(
        post = ApiPost(
            id = "p1",
            content = "salut @Bob #tag",
            mentionedUsers = listOf(MentionedUser(userId = "u2", username = "Bob", displayName = "Robert")),
        ),
        preferences = prefs,
        mediaBaseUrl = null,
    )

    @Test
    fun `deux constructions du meme post sont structurellement egales`() {
        assertThat(build()).isEqualTo(build())
        assertThat(build().hashCode()).isEqualTo(build().hashCode())
    }

    @Test
    fun `les mentions validees sont indexees par pseudo en minuscules`() {
        val post = build()

        assertThat(post.mentionUserIds).containsExactly("bob", "u2")
        assertThat(post.mentionDisplayNames).containsExactly("Bob", "Robert")
    }
}
