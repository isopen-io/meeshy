package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OptimisticPostTest {

    private val author = ApiAuthor(id = "u1", username = "ana")

    private fun bubble(cmid: String = "cmid_1", media: List<OptimisticMedia> = emptyList()) =
        OptimisticPost.build(cmid = cmid, author = author, content = "salut", media = media, createdAtMillis = 0L)

    @Test
    fun `la bulle porte le cmid pour id et les medias locaux depuis l'URI`() {
        val post = bubble(media = listOf(OptimisticMedia("file:///a.jpg", "image/jpeg", 10, 20)))
        assertThat(post.id).isEqualTo("cmid_1")
        assertThat(post.media!!.single().fileUrl).isEqualTo("file:///a.jpg")
        assertThat(post.createdAt).isEqualTo("1970-01-01T00:00:00Z")
        assertThat(post.author).isEqualTo(author)
    }

    @Test
    fun `un texte blanc sans media donne un contenu nul`() {
        val post = OptimisticPost.build("cmid_1", author, "  ", createdAtMillis = 0L)
        assertThat(post.content).isNull()
        assertThat(post.media).isNull()
    }

    @Test
    fun `la bulle s'insere en tete une seule fois`() {
        val feed = listOf(ApiPost(id = "p1"))
        val once = OptimisticPost.insertAtHead(feed, bubble())
        val twice = OptimisticPost.insertAtHead(once, bubble())
        assertThat(twice.map { it.id }).containsExactly("cmid_1", "p1").inOrder()
    }

    @Test
    fun `la reconciliation remplace la bulle sur place`() {
        val feed = listOf(bubble(), ApiPost(id = "p1"))
        val out = OptimisticPost.reconcile(feed, "cmid_1", ApiPost(id = "srv"))
        assertThat(out.map { it.id }).containsExactly("srv", "p1").inOrder()
    }

    @Test
    fun `si post created a devance la reponse il n'y a pas de doublon`() {
        val feed = listOf(bubble(), ApiPost(id = "srv"), ApiPost(id = "p1"))
        val out = OptimisticPost.reconcile(feed, "cmid_1", ApiPost(id = "srv"))
        assertThat(out.map { it.id }).containsExactly("srv", "p1").inOrder()
    }

    @Test
    fun `un echec definitif retire la bulle`() {
        val out = OptimisticPost.withdraw(listOf(bubble(), ApiPost(id = "p1")), "cmid_1")
        assertThat(out.map { it.id }).containsExactly("p1")
    }
}
