package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ContentRemovalRequest
import org.junit.Test

/** Un retrait avec motif porte `{reason}` ; sans motif la requête reste celle d'avant, sans corps. */
class ContentRemovalWireTest {

    @Test
    fun `un retrait de message avec motif envoie un DELETE avec le corps reason`() = runTest {
        val http = RecordingHttp()

        http.serve(ContentRemovalApi::class.java).removeMessage("m1", ContentRemovalRequest("spam"))

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/messages/m1")
        assertThat(http.only.body).isEqualTo("""{"reason":"spam"}""")
        assertThat(http.only.contentType).startsWith("application/json")
    }

    @Test
    fun `un retrait de publication et de commentaire visent leur route`() = runTest {
        val http = RecordingHttp()
        val api = http.serve(ContentRemovalApi::class.java)

        api.removePost("p1", ContentRemovalRequest("a"))
        api.removeComment("p1", "c1", ContentRemovalRequest("b"))

        assertThat(http.requests.map { it.path }).containsExactly("/api/v1/posts/p1", "/api/v1/posts/p1/comments/c1").inOrder()
        assertThat(http.requests.map { it.body }).containsExactly("""{"reason":"a"}""", """{"reason":"b"}""").inOrder()
    }

    @Test
    fun `sans motif la requete est celle d avant, sans corps ni type de contenu`() = runTest {
        val http = RecordingHttp()

        http.serve(MessageApi::class.java).delete("m1")
        http.serve(PostApi::class.java).delete("p1")
        http.serve(PostApi::class.java).deleteComment("p1", "c1")

        assertThat(http.requests.map { it.method }.toSet()).containsExactly("DELETE")
        assertThat(http.requests.map { it.body }).containsExactly(null, null, null)
        assertThat(http.requests.map { it.contentType }).containsExactly(null, null, null)
    }
}
