package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.MentionedUser
import org.junit.Test

class FeedAuthorTapTest {
    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun post(author: ApiAuthor?, content: String = "salut") =
        FeedPostBuilder.build(
            post = ApiPost(
                id = "p1",
                content = content,
                author = author,
                mentionedUsers = listOf(MentionedUser(userId = "u2", username = "Bob", displayName = "Robert")),
            ),
            preferences = prefs,
            mediaBaseUrl = null,
        )

    @Test
    fun `l auteur d un post ouvre sa fiche avec l identite de la surface`() {
        val user = post(ApiAuthor(id = "u1", username = "alice", displayName = "Alice", avatar = "/a.png")).authorProfile()!!
        assertThat(user.id).isEqualTo("u1")
        assertThat(user.username).isEqualTo("alice")
        assertThat(user.displayName).isEqualTo("Alice")
    }

    @Test
    fun `un post sans auteur identifiable n est pas cliquable`() {
        assertThat(post(author = null).authorProfile()).isNull()
    }

    @Test
    fun `l auteur d un commentaire ouvre sa fiche`() {
        val comment = CommentProjection.build(
            ApiPostComment(id = "c1", content = "ok", author = ApiAuthor(id = "u3", username = "carl", displayName = "Carl")),
            prefs,
            null,
            depth = 0,
        )
        assertThat(comment.authorProfile()!!.id).isEqualTo("u3")
    }

    @Test
    fun `un commentaire sans auteur n est pas cliquable`() {
        val comment = CommentProjection.build(ApiPostComment(id = "c1", content = "ok", author = null), prefs, null, depth = 0)
        assertThat(comment.authorProfile()).isNull()
    }

    @Test
    fun `l auteur d un repost embarque ouvre sa fiche`() {
        val embed = RepostEmbedBuilder.build(
            ApiRepostOf(id = "r1", content = "x", author = ApiAuthor(id = "u9", username = "orig", displayName = "Origen")),
            prefs,
            null,
        )!!
        assertThat(embed.authorProfile()!!.id).isEqualTo("u9")
    }

    @Test
    fun `une mention connue ouvre le compte et une mention inconnue ouvre par pseudo`() {
        val p = post(ApiAuthor(id = "u1", username = "alice"), content = "salut @Bob @zed")
        assertThat(p.mentionProfile("Bob")!!.userId).isEqualTo("u2")
        val unknown = p.mentionProfile("@zed")!!
        assertThat(unknown.userId).isNull()
        assertThat(unknown.id).isEqualTo("zed")
    }
}
