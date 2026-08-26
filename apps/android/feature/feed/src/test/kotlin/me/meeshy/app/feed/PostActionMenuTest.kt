package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostActionMenuTest {

    // Le post d'un AUTRE : tout sauf la suppression, et le signalement en dernier —
    // une action de moderation ne doit jamais preceder les actions ordinaires.
    @Test
    fun `someone else's post offers share, copy, repost, quote, bookmark then report`() {
        val actions = PostActionMenu.actions(PostActionContext(isOwn = false, isBookmarked = false))
        assertThat(actions).containsExactly(
            PostAction.Share,
            PostAction.CopyLink,
            PostAction.Repost,
            PostAction.Quote,
            PostAction.Bookmark,
            PostAction.Report,
        ).inOrder()
    }

    // Citer suit immediatement reposter, pour tout post — parite iOS (le menu de
    // partage offre repost ET quote, cf. PostDetailView.toggleDetailRepost).
    @Test
    fun `quote follows repost for any post`() {
        val actions = PostActionMenu.actions(PostActionContext(isOwn = true, isBookmarked = false))
        assertThat(actions.indexOf(PostAction.Quote))
            .isEqualTo(actions.indexOf(PostAction.Repost) + 1)
    }

    // Son PROPRE post : la suppression remplace le signalement (se signaler
    // soi-meme est sans objet), en derniere position — action destructrice.
    // L'epinglage (pin) — reservee au proprietaire, comme cote iOS — se glisse
    // juste avant, portee ordinaire (pas destructrice).
    @Test
    fun `your own post offers pin then delete instead of report, last`() {
        val actions = PostActionMenu.actions(PostActionContext(isOwn = true, isBookmarked = false))
        assertThat(actions).containsExactly(
            PostAction.Share,
            PostAction.CopyLink,
            PostAction.Repost,
            PostAction.Quote,
            PostAction.Bookmark,
            PostAction.Pin,
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

    // Le pin est reserve au proprietaire — port fidele d'iOS, qui ne branche
    // `onPin` que sur `isOwnPost` (ProfileUserPostsList.swift/PostDetailViewModel.swift) ;
    // aucune UI iOS n'expose jamais un pin sur le post d'autrui.
    @Test
    fun `someone else's post never offers pin`() {
        val actions = PostActionMenu.actions(PostActionContext(isOwn = false, isBookmarked = false))
        assertThat(actions).doesNotContain(PostAction.Pin)
    }
}
