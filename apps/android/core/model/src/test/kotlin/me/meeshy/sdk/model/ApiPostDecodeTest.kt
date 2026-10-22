package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ApiPostDecodeTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String): ApiPost = json.decodeFromString(ApiPost.serializer(), raw)

    @Test
    fun `un post servi garde compteurs, mentions typees, points et anneau d'auteur`() {
        val post = decode(
            """{"id":"p1","type":"REEL","createdAt":"2026-10-01T10:00:00.000Z","futureField":{"x":1},
            "author":{"id":"u1","username":"ann","profileDecor":{"avatarRing":{"pack":"neon","item":"ring1","origin":"builtin"}}},
            "postOpenCount":7,"qualifiedViewCount":5,"playCount":3,"uniqueViewCount":4,"anonymousViewCount":2,
            "viewerPoints":12,"rankingSource":"for-you","isRepostedByMe":true,
            "referenceAccess":"granted",
            "mentions":[{"userId":"u2","username":"bob","display":"NOTE"},{"userId":"u3","username":"eve","display":"SILENT"}],
            "trackingLinks":[{"url":"https://a.com","token":"t1"},{"url":"https://a.com","token":"t2"}]}""",
        )
        assertThat(post.postType).isEqualTo(PostType.REEL)
        assertThat(post.postOpenCount).isEqualTo(7)
        assertThat(post.qualifiedViewCount).isEqualTo(5)
        assertThat(post.playCount).isEqualTo(3)
        assertThat(post.uniqueViewCount).isEqualTo(4)
        assertThat(post.anonymousViewCount).isEqualTo(2)
        assertThat(post.viewerPoints).isEqualTo(12)
        assertThat(post.isRepostedByMe).isTrue()
        assertThat(post.referenceAccess).isEqualTo(ReferenceAccess.GRANTED)
        assertThat(post.authorRing?.item).isEqualTo("ring1")
        assertThat(post.mentions!!.map { it.display }).containsExactly(PostReferenceDisplay.NOTE, PostReferenceDisplay.SILENT).inOrder()
        assertThat(post.trackedLinkMap).containsExactly("https://a.com", "t2")
    }

    @Test
    fun `les liens suivis du REST se lisent sous metadata`() {
        val post = decode("""{"id":"p1","metadata":{"trackingLinks":[{"url":"u","token":"k"}],"other":1}}""")
        assertThat(post.trackedLinkMap).containsExactly("u", "k")
    }

    @Test
    fun `un post minimal et des champs mal formes ne font jamais echouer le decodage`() {
        val post = decode(
            """{"id":"p1","mentions":[{"nope":1}],"metadata":"oops","viewerPoints":-3,
            "referenceAccess":"surprise","author":{"id":"u","profileDecor":{"avatarRing":{"bad":true}}}}""",
        )
        assertThat(post.mentions).isNull()
        assertThat(post.metadata).isNull()
        assertThat(post.viewerPoints).isNull()
        assertThat(post.referenceAccess).isEqualTo(ReferenceAccess.NONE)
        assertThat(post.authorRing).isNull()
        assertThat(post.postOpenCount).isNull()
        assertThat(post.postType).isNull()
    }

    @Test
    fun `un repost garde mentions, lieu et anneau de l'original`() {
        val post = decode(
            """{"id":"p","repostOf":{"id":"o","moodEmoji":"x","location":{"latitude":1.0,"longitude":2.0},
            "mentions":[{"userId":"u","username":"zed"}]}}""",
        )
        assertThat(post.repostOf!!.mentions!!.single().display).isEqualTo(PostReferenceDisplay.INLINE)
        assertThat(post.repostOf!!.location!!.latitude).isEqualTo(1.0)
    }

    @Test
    fun `MAX_POST_MEDIA vaut 10 et PostType est ordonne`() {
        assertThat(MAX_POST_MEDIA).isEqualTo(10)
        assertThat(PostType.entries.map { it.wire }).containsExactly("POST", "REEL", "STORY", "STATUS").inOrder()
        assertThat(postTypeFromWire("WHATEVER")).isNull()
    }
}
