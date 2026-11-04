package me.meeshy.sdk.model.comment

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentMediaResumeTest {
    private val now = 100L * 60 * 60 * 1000

    private fun up(index: Int, id: String, ageHours: Long) = UploadedCommentMedia(index, id, now - ageHours * 60 * 60 * 1000)

    @Test
    fun `une piece deja montee et presentable n'est pas renvoyee`() {
        val plan = CommentMediaResume.plan(3, listOf(up(1, "m1", 1)), now) { true }
        assertThat(plan.acquired.map { it.id }).containsExactly("m1")
        assertThat(plan.toUpload).containsExactly(0, 2).inOrder()
        assertThat(plan.missing).isEmpty()
    }

    @Test
    fun `une piece montee depuis trop longtemps repart depuis son fichier`() {
        val plan = CommentMediaResume.plan(1, listOf(up(0, "old", 21)), now) { true }
        assertThat(plan.acquired).isEmpty()
        assertThat(plan.toUpload).containsExactly(0)
    }

    @Test
    fun `un fichier disparu sans id presentable est signale manquant`() {
        val plan = CommentMediaResume.plan(2, listOf(up(0, "m0", 1)), now) { false }
        assertThat(plan.acquired.map { it.id }).containsExactly("m0")
        assertThat(plan.missing).containsExactly(1)
    }

    @Test
    fun `les ids partent dans l'ordre des pieces`() {
        assertThat(CommentMediaResume.attachmentIds(listOf(up(2, "c", 0), up(0, "a", 0), up(1, "b", 0))))
            .containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `un instant dans le futur n'est pas presentable`() {
        assertThat(UploadedCommentMedia(0, "x", now + 1).isClaimable(now)).isFalse()
    }
}
