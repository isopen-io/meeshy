package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ApiPostCommentMediaDecodeTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String): ApiPostComment = json.decodeFromString(ApiPostComment.serializer(), raw)

    @Test
    fun `un commentaire garde media, lieu, citation, liens suivis et anneau`() {
        val c = decode(
            """{"id":"c1","content":"hi","unknown":1,
            "author":{"id":"u","profileDecor":{"avatarRing":{"pack":"p","item":"i"}}},
            "media":[{"id":"m1","fileUrl":"https://f/a.jpg","mimeType":"image/jpeg"}],
            "location":{"latitude":48.8,"longitude":2.3,"name":"Paris"},
            "quotedPostMedia":{"postMediaId":"pm1","kind":"video"},
            "quotedMedia":{"id":"pm1","fileUrl":"https://f/v.mp4","thumbnailUrl":"https://f/t.jpg"},
            "metadata":{"trackingLinks":[{"url":"https://x.io","token":"tk"}]}}""",
        )
        assertThat(c.media!!.single().id).isEqualTo("m1")
        assertThat(c.location!!.name).isEqualTo("Paris")
        assertThat(c.author!!.avatarRing!!.item).isEqualTo("i")
        assertThat(c.quotedCitation!!.kind).isEqualTo(CommentQuotedMedia.Kind.VIDEO)
        assertThat(c.quotedCitation!!.thumbnailUrl).isEqualTo("https://f/t.jpg")
        assertThat(c.trackedLinkMap).containsExactly("https://x.io", "tk")
    }

    @Test
    fun `un commentaire ancien sans aucun de ces champs se decode`() {
        val c = decode("""{"id":"c1"}""")
        assertThat(c.media).isNull()
        assertThat(c.quotedCitation).isNull()
        assertThat(c.trackedLinkMap).isEmpty()
    }

    @Test
    fun `une nature de citation inconnue vaut un fichier`() {
        val c = decode("""{"id":"c","quotedPostMedia":{"postMediaId":"p","kind":"hologram"}}""")
        assertThat(c.quotedCitation!!.kind).isEqualTo(CommentQuotedMedia.Kind.FILE)
    }
}
