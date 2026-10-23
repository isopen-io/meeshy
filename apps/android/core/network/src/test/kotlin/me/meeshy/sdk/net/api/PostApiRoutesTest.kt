package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/** Les routes sociales neuves, telles qu'elles partent — requête capturée derrière le vrai Retrofit. */
class PostApiRoutesTest {

    private fun posts(http: RecordingHttp) = http.serve(PostApi::class.java)

    @Test
    fun `les posts d un mot-diese se lisent par curseur`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[],"pagination":{"hasMore":true,"nextCursor":"c2"},"meta":{"feedRequestId":"r1"}}""")

        val response = posts(http).getByHashtag("paris", cursor = "c1", limit = 20)

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/posts/hashtag/paris")
        assertThat(http.only.queryParameter("cursor")).isEqualTo("c1")
        assertThat(response.pagination?.nextCursor).isEqualTo("c2")
        assertThat(response.meta?.feedRequestId).isEqualTo("r1")
    }

    @Test
    fun `la densite a proximite envoie le pas de grille`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[{"cellLat":48.5,"cellLng":2.5,"count":3}]}""")

        val cells = posts(http).getNearbyDensity(48.85, 2.35, 25.0, 10.0).data!!

        assertThat(http.only.path).isEqualTo("/api/v1/posts/nearby/density")
        assertThat(http.only.queryParameter("cellSizeKm")).isEqualTo("10.0")
        assertThat(http.only.queryParameter("radiusKm")).isEqualTo("25.0")
        assertThat(cells.single().count).isEqualTo(3)
    }

    @Test
    fun `un retrait de post porte le motif en corps d un DELETE`() = runTest {
        val http = RecordingHttp()

        posts(http).deleteWithReason("p1", ContentRemovalBody("spam"))

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/posts/p1")
        assertThat(http.only.body).isEqualTo("""{"reason":"spam"}""")
    }

    @Test
    fun `un retrait de commentaire porte le motif en corps d un DELETE`() = runTest {
        val http = RecordingHttp()

        posts(http).deleteCommentWithReason("p1", "c9", ContentRemovalBody("insulte"))

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/posts/p1/comments/c9")
        assertThat(http.only.body).isEqualTo("""{"reason":"insulte"}""")
    }

    @Test
    fun `la suppression par son auteur part toujours sans corps`() = runTest {
        val http = RecordingHttp()

        posts(http).delete("p1")

        assertThat(http.only.body).isNull()
    }

    @Test
    fun `l edition d un commentaire est un PATCH qui n envoie que les champs poses`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"id":"c9"}}""")

        posts(http).updateComment("p1", "c9", UpdateCommentRequest(content = "corrige"))

        assertThat(http.only.method).isEqualTo("PATCH")
        assertThat(http.only.path).isEqualTo("/api/v1/posts/p1/comments/c9")
        assertThat(http.only.body).isEqualTo("""{"content":"corrige"}""")
    }

    @Test
    fun `le partage avec lien demande generateLink`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"shared":true,"shareCount":2,"shortUrl":"https://meeshy.me/l/t"}}""")

        val result = posts(http).shareWithLink("p1", SharePostRequest("copy", generateLink = true)).data!!

        assertThat(http.only.path).isEqualTo("/api/v1/posts/p1/share")
        assertThat(http.only.body).isEqualTo("""{"platform":"copy","generateLink":true}""")
        assertThat(result.shortUrl).isEqualTo("https://meeshy.me/l/t")
    }

    @Test
    fun `la traduction de legende vise le media`() = runTest {
        val http = RecordingHttp()

        posts(http).requestMediaCaptionTranslation("m1", PostTranslationRequest("fr"))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/posts/media/m1/caption/translate")
        assertThat(http.only.body).isEqualTo("""{"targetLanguage":"fr"}""")
    }

    @Test
    fun `la traduction de commentaire n ecrit force que s il est vrai`() = runTest {
        val http = RecordingHttp()

        posts(http).requestCommentTranslation("p1", "c9", CommentTranslationRequest("es"))

        assertThat(http.only.path).isEqualTo("/api/v1/posts/p1/comments/c9/translate")
        assertThat(http.only.body).isEqualTo("""{"targetLanguage":"es"}""")
    }

    @Test
    fun `publier une piece jointe n envoie que ce que le serveur ne deduit pas`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"id":"p2"}}""")

        posts(http).publishAttachment(PublishAttachmentRequest(attachmentId = "a1", target = "REEL"))

        assertThat(http.only.path).isEqualTo("/api/v1/posts/from-attachment")
        assertThat(http.only.body).isEqualTo("""{"attachmentId":"a1","target":"REEL"}""")
    }

    @Test
    fun `rendre prive passe par la porte de moderation de l auteur`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"action":"make-private","results":[{"postId":"p1","outcome":"updated"}]}}""")

        val receipt = posts(http)
            .moderatePublications("u7", PublicationModerationRequest("make-private", listOf("p1"), "hors sujet")).data!!

        assertThat(http.only.path).isEqualTo("/api/v1/admin/users/u7/publications/moderation")
        assertThat(http.only.body).isEqualTo("""{"action":"make-private","postIds":["p1"],"reason":"hors sujet"}""")
        assertThat(receipt.isApplied("p1")).isTrue()
    }

    @Test
    fun `creation commentaire et repost portent l en-tete d idempotence`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"id":"x"}}""")
        val api = posts(http)

        api.create(CreatePostRequest(content = "a"), "cmid_1")
        api.addComment("p1", CreateCommentRequest("b"), "cmid_2")
        api.repost("p1", RepostPostRequest(), "cmid_3")

        assertThat(http.requests.map { it.request.header(CLIENT_MUTATION_ID_HEADER) })
            .containsExactly("cmid_1", "cmid_2", "cmid_3").inOrder()
    }

    @Test
    fun `sans identifiant l en-tete d idempotence est absent`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"id":"x"}}""")

        posts(http).create(CreatePostRequest(content = "a"))

        assertThat(http.only.request.header(CLIENT_MUTATION_ID_HEADER)).isNull()
    }
}
