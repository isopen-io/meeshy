package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostGalleryCommentFeedTest {
    private fun c(id: String, content: String = "", parent: String? = null) = ApiPostComment(id = id, content = content, parentId = parent)

    @Test
    fun `ajouter remplace une ligne connue et place une inconnue a la suite`() {
        val current = listOf(c("a", "x"), c("b"))
        assertThat(PostGalleryCommentFeed.adding(c("a", "y"), current).map { it.content }).containsExactly("y", "").inOrder()
        assertThat(PostGalleryCommentFeed.adding(c("z"), current).map { it.id }).containsExactly("a", "b", "z").inOrder()
    }

    @Test
    fun `retirer un commentaire retire aussi ses reponses`() {
        val current = listOf(c("a"), c("r", parent = "a"), c("b"))
        assertThat(PostGalleryCommentFeed.removing("a", current).map { it.id }).containsExactly("b")
    }

    @Test
    fun `fusionner garde l'ordre affiche, rafraichit les lignes connues et dedoublonne les nouvelles`() {
        val merged = PostGalleryCommentFeed.merging(listOf(c("b", "neuf"), c("n"), c("n")), into = listOf(c("a"), c("b", "vieux")))
        assertThat(merged.map { it.id }).containsExactly("a", "b", "n").inOrder()
        assertThat(merged[1].content).isEqualTo("neuf")
    }
}
