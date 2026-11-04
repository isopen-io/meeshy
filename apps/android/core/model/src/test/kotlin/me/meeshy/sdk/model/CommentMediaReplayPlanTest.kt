package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentMediaReplayPlanTest {

    private fun piece(key: String, id: String? = null, exists: Boolean = true) = CommentPiece(key, id, exists)

    @Test
    fun `seules les pieces manquantes sont rejouees dans l'ordre`() {
        val plan = CommentMediaReplayPlan.plan(listOf(piece("a"), piece("b", "id-b"), piece("c")))
        assertThat(plan).isEqualTo(CommentMediaReplay.Upload(listOf("a", "c")))
    }

    @Test
    fun `une piece disparue refuse le commentaire`() {
        val plan = CommentMediaReplayPlan.plan(listOf(piece("a", exists = false), piece("b", "id-b")))
        assertThat(plan).isEqualTo(CommentMediaReplay.Refused(listOf("a")))
        assertThat((plan as CommentMediaReplay.Refused).httpStatus).isEqualTo(422)
    }

    @Test
    fun `un fichier disparu deja televerse ne refuse rien`() {
        val plan = CommentMediaReplayPlan.plan(listOf(piece("a", "id-a", exists = false)))
        assertThat(plan).isEqualTo(CommentMediaReplay.Ready(listOf("id-a")))
    }

    @Test
    fun `tout est pret quand chaque piece a son id dans l'ordre promis`() {
        val plan = CommentMediaReplayPlan.plan(listOf(piece("a", "1"), piece("b", "2"), piece("c", "3")))
        assertThat(plan).isEqualTo(CommentMediaReplay.Ready(listOf("1", "2", "3")))
    }
}
