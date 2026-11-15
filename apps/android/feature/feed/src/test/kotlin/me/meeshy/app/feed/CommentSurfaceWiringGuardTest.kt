package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/** #8582 — chaque surface de commentaire monte les DEUX modificateurs : le glissé « répondre » ET le corps à effets. */
class CommentSurfaceWiringGuardTest {
    private fun source(name: String) = File("src/main/kotlin/me/meeshy/app/feed/$name").readText()

    @Test
    fun `la feuille et l'apercu montent le glisse ET le corps a effets`() {
        listOf("PostCommentsSection.kt", "FeedCommentsPreview.kt").forEach { file ->
            val text = source(file)
            assertThat(text).contains("commentSwipeToReply")
            assertThat(text).contains("CommentBody(")
        }
    }

    @Test
    fun `glisser un commentaire de l'apercu ouvre la feuille en reponse a celui-ci`() {
        assertThat(source("FeedScreen.kt")).contains("commentsReplyTo = commentId")
        assertThat(source("FeedCommentsHost.kt")).contains("beginReply")
    }
}
