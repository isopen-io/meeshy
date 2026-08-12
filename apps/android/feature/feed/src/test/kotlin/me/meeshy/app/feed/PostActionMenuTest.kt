package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostActionMenuTest {

    // Le post d'un AUTRE : tout sauf la suppression, et le signalement en dernier —
    // une action de moderation ne doit jamais preceder les actions ordinaires.
    @Test
    fun `someone else's post offers share, copy, repost, bookmark then report`() {
        val actions = PostActionMenu.actions(PostActionContext(isOwn = false, isBookmarked = false))
        assertThat(actions).containsExactly(
            PostAction.Share,
            PostAction.CopyLink,
            PostAction.Repost,
            PostAction.Bookmark,
            PostAction.Report,
        ).inOrder()
    }

    // Son PROPRE post : la suppression remplace le signalement (se signaler
    // soi-meme est sans objet), en derniere position — action destructrice.
    @Test
    fun `your own post offers delete instead of report, last`() {
        val actions = PostActionMenu.actions(PostActionContext(isOwn = true, isBookmarked = false))
        assertThat(actions).containsExactly(
            PostAction.Share,
            PostAction.CopyLink,
            PostAction.Repost,
            PostAction.Bookmark,
            PostAction.Delete,
        ).inOrder()
    }

    // L'etat enregistre bascule l'entree bookmark : jamais les deux a la fois.
    @Test
    fun `a bookmarked post offers unbookmark, never both`() {
        val actions = PostActionMenu.actions(PostActionContext(isOwn = false, isBookmarked = true))
        assertThat(actions).contains(PostAction.Unbookmark)
        assertThat(actions).doesNotContain(PostAction.Bookmark)
    }
}
