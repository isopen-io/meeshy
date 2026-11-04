package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/** Le corps d'un commentaire tel qu'il part : pièces, citation, effets, lieu, langue — et l'épingle au jeton vérifié. */
class CreateCommentRequestSerializationTest {

    private fun posts(http: RecordingHttp) = http.serve(PostApi::class.java)
    private fun ok() = RecordingHttp(responseBody = """{"success":true,"data":{"id":"c1"}}""")

    @Test
    fun `un commentaire a pieces porte attachmentIds, citation et effets`() = runTest {
        val http = ok()
        val request = CreateCommentRequest(
            content = "vu",
            attachmentIds = listOf("m1", "m2"),
            quotedPostMedia = QuotedPostMediaAnchor("pm9"),
            effectFlags = 4,
            originalLanguage = "fr",
        )

        posts(http).addComment("p1", request, "cmid_1")

        val body = http.only.body!!
        assertThat(body).contains(""""attachmentIds":["m1","m2"]""")
        assertThat(body).contains(""""quotedPostMedia":{"postMediaId":"pm9"}""")
        assertThat(body).contains(""""effectFlags":4""")
        assertThat(body).contains(""""originalLanguage":"fr"""")
    }

    @Test
    fun `un commentaire simple ne porte aucune cle de piece ni de citation`() = runTest {
        val http = ok()

        posts(http).addComment("p1", CreateCommentRequest("salut"), "cmid_1")

        assertThat(http.only.body).isEqualTo("""{"content":"salut"}""")
    }

    @Test
    fun `la requete est epinglee au jeton remis`() = runTest {
        val http = ok()

        posts(http).addComment("p1", CreateCommentRequest("a"), "cmid_1", "Bearer tok-A")

        assertThat(http.only.request.header("Authorization")).isEqualTo("Bearer tok-A")
        assertThat(http.only.request.header(CLIENT_MUTATION_ID_HEADER)).isEqualTo("cmid_1")
    }

    @Test
    fun `sans jeton remis aucun en-tete d autorisation n est pose par l interface`() = runTest {
        val http = ok()

        posts(http).addComment("p1", CreateCommentRequest("a"), "cmid_1")

        assertThat(http.only.request.header("Authorization")).isNull()
    }
}
