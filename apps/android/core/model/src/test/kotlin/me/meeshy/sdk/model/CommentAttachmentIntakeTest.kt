package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentAttachmentIntakeTest {

    private fun candidate(id: String, mime: String? = "image/jpeg", name: String = "$id.jpg", isReady: Boolean = true) =
        CommentAttachmentIntake.Candidate(id = id, mimeType = mime, fileName = name, isReady = isReady)

    @Test
    fun `une photo, une video et un son sont des medias de commentaire`() {
        assertThat(CommentAttachmentIntake.kindOf("image/png", "a.png")).isEqualTo(CommentPieceKind.IMAGE)
        assertThat(CommentAttachmentIntake.kindOf("video/mp4", "a.mp4")).isEqualTo(CommentPieceKind.VIDEO)
        assertThat(CommentAttachmentIntake.kindOf("audio/mp4", "a.m4a")).isEqualTo(CommentPieceKind.AUDIO)
    }

    @Test
    fun `un fichier importe qui est un media prend son type par son extension`() {
        assertThat(CommentAttachmentIntake.kindOf("application/octet-stream", "memo.m4a")).isEqualTo(CommentPieceKind.AUDIO)
        assertThat(CommentAttachmentIntake.kindOf(null, "clip.MOV")).isEqualTo(CommentPieceKind.VIDEO)
        assertThat(CommentAttachmentIntake.kindOf("", "photo.heic")).isEqualTo(CommentPieceKind.IMAGE)
    }

    @Test
    fun `un document reste un fichier`() {
        assertThat(CommentAttachmentIntake.kindOf("application/pdf", "cv.pdf")).isEqualTo(CommentPieceKind.FILE)
    }

    @Test
    fun `une piece qui ne dit ni son type ni son nom est refusee a la pose`() {
        val outcome = CommentAttachmentIntake.admit(listOf(candidate("x", mime = null, name = " ")), staged = emptyList(), limit = 10)
        assertThat(outcome.accepted).isEmpty()
        assertThat(outcome.foreign.map { it.id }).containsExactly("x")
        assertThat(outcome.shouldWarn).isTrue()
    }

    @Test
    fun `le plafond est celui du serveur et les pieces en trop sont refusees`() {
        val staged = (1..9).map { candidate("s$it") }
        val outcome = CommentAttachmentIntake.admit(listOf(candidate("a"), candidate("b")), staged, limit = MAX_POST_MEDIA)
        assertThat(outcome.accepted.map { it.id }).containsExactly("a")
        assertThat(outcome.refused.map { it.id }).containsExactly("b")
        assertThat(outcome.zone).hasSize(10)
        assertThat(outcome.shouldWarn).isTrue()
    }

    @Test
    fun `une zone a une piece est remplacee par la derniere venue`() {
        val outcome = CommentAttachmentIntake.admit(listOf(candidate("a"), candidate("b")), listOf(candidate("old")), limit = 1)
        assertThat(outcome.zone.map { it.id }).containsExactly("b")
        assertThat(outcome.evicted.map { it.id }).containsExactly("old")
        assertThat(outcome.refused.map { it.id }).containsExactly("a")
    }

    @Test
    fun `rien a poser ne change la zone et n avertit pas`() {
        val staged = listOf(candidate("s"))
        val outcome = CommentAttachmentIntake.admit(emptyList(), staged, limit = 10)
        assertThat(outcome.zone).isEqualTo(staged)
        assertThat(outcome.shouldWarn).isFalse()
    }

    @Test
    fun `une piece pas encore lue apparait dans la zone et garde l envoi`() {
        val zone = listOf(candidate("a"), candidate("b", isReady = false))
        assertThat(CommentAttachmentIntake.stillLoading(zone).map { it.id }).containsExactly("b")
    }
}
