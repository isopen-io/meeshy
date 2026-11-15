package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class CommentMediaFilesTest {
    private val root = File("/data/pending-media")

    @Test
    fun `un fichier du dossier de son auteur se resout`() {
        assertThat(CommentMediaFiles.resolveIn(root, "u-1", "comments-u1/cmid_9/0.jpg")).isEqualTo(File(root, "comments-u1/cmid_9/0.jpg"))
    }

    @Test
    fun `le dossier d'un autre compte, un chemin absolu ou un point-point ne menent a rien`() {
        listOf("comments-u2/cmid_9/0.jpg", "/etc/passwd", "comments-u1/../comments-u2/x.jpg", "comments-u1//x.jpg", "comments-u1").forEach {
            assertThat(CommentMediaFiles.resolveIn(root, "u1", it)).isNull()
        }
    }

    @Test
    fun `sans compte utilisable rien ne se resout`() {
        assertThat(CommentMediaFiles.resolveIn(root, null, "comments-/0.jpg")).isNull()
        assertThat(CommentMediaFiles.resolveIn(root, "  ", "comments-/a/0.jpg")).isNull()
    }
}
