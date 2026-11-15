package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.CommentQuotedMedia
import org.junit.Test

class CommentQuotationStoreTest {
    private fun citation(id: String, kind: CommentQuotedMedia.Kind = CommentQuotedMedia.Kind.IMAGE) = CommentQuotedMedia(id, kind)

    @Test
    fun `designer pose la citation du post et pas celle d un autre`() {
        val store = CommentQuotationStore()
        store.designate(citation("m1"), postId = "p1")
        assertThat(store.quotation("p1")?.postMediaId).isEqualTo("m1")
        assertThat(store.quotation("p2")).isNull()
    }

    @Test
    fun `designer remplace la designation precedente au lieu de l empiler`() {
        val store = CommentQuotationStore()
        store.designate(citation("m1"), "p1")
        store.designate(citation("m2", CommentQuotedMedia.Kind.VIDEO), "p1")
        assertThat(store.quotation("p1")?.postMediaId).isEqualTo("m2")
        assertThat(store.quotations.value).hasSize(1)
    }

    @Test
    fun `clear retire seulement la citation de ce post`() {
        val store = CommentQuotationStore()
        store.designate(citation("m1"), "p1")
        store.designate(citation("m2"), "p2")
        store.clear("p1")
        assertThat(store.quotation("p1")).isNull()
        assertThat(store.quotation("p2")).isNotNull()
    }

    @Test
    fun `clearAll vide tout a la deconnexion`() = runTest {
        val store = CommentQuotationStore()
        store.designate(citation("m1"), "p1")
        store.designate(citation("m2"), "p2")
        store.clear()
        assertThat(store.quotations.value).isEmpty()
    }
}
