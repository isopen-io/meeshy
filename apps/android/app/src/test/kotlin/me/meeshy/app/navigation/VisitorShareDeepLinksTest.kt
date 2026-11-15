package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.visitor.VisitorContentRequest
import org.junit.Test

/** Les liens que le visiteur lit (`VisitorContentRequest`) et ceux que le graphe ouvre connecte sont les memes. */
class VisitorShareDeepLinksTest {
    private fun fill(pattern: String, id: String) = pattern.replace(Regex("\\{[^}]+}"), id)

    @Test
    fun `chaque lien de partage du graphe est un contenu visiteur, sur les deux hotes`() {
        val patterns = Routes.POST_SHARE_DEEP_LINKS + Routes.REEL_SHARE_DEEP_LINKS + Routes.STORY_SHARE_DEEP_LINKS
        patterns.forEach { pattern ->
            assertThat(VisitorContentRequest.fromUri(fill(pattern, "abc123"))?.postId).isEqualTo("abc123")
        }
    }

    @Test
    fun `un reel et une story ne se confondent pas avec une publication`() {
        assertThat(Routes.REEL_SHARE_DEEP_LINKS.map { VisitorContentRequest.fromUri(fill(it, "x"))?.kind }.toSet()).hasSize(1)
        assertThat(Routes.STORY_SHARE_DEEP_LINKS.map { VisitorContentRequest.fromUri(fill(it, "x"))?.kind }.toSet()).hasSize(1)
    }
}
