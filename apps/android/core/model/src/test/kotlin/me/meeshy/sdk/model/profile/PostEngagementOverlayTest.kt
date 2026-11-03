package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import org.junit.Test

class PostEngagementOverlayTest {

    private fun post(
        id: String = "p1",
        likes: Int = 5,
        liked: Boolean = false,
        bookmarks: Int = 2,
        bookmarked: Boolean = false,
        reposts: Int = 1,
        reposted: Boolean = false,
        shares: Int = 0,
    ) = ApiPost(
        id = id,
        likeCount = likes,
        isLikedByMe = liked,
        bookmarkCount = bookmarks,
        isBookmarkedByMe = bookmarked,
        repostCount = reposts,
        isRepostedByMe = reposted,
        shareCount = shares,
    )

    @Test
    fun `un j'aime au toucher ajoute un au compteur et allume le coeur`() {
        val overlay = PostEngagementOverlay().withLike("p1", true)
        assertThat(overlay.isLiked(post())).isTrue()
        assertThat(overlay.likeCount(post())).isEqualTo(6)
    }

    @Test
    fun `retirer un j'aime servi retire un au compteur sans descendre sous zero`() {
        val overlay = PostEngagementOverlay().withLike("p1", false)
        assertThat(overlay.likeCount(post(likes = 5, liked = true))).isEqualTo(4)
        assertThat(overlay.likeCount(post(likes = 0, liked = true))).isEqualTo(0)
    }

    @Test
    fun `une surcharge egale a la valeur servie n'ajuste rien`() {
        val overlay = PostEngagementOverlay().withLike("p1", true)
        assertThat(overlay.likeCount(post(likes = 6, liked = true))).isEqualTo(6)
    }

    @Test
    fun `le retour arriere remet l'etat d'avant le toucher`() {
        val tapped = PostEngagementOverlay().withLike("p1", true)
        val rolledBack = tapped.withLike("p1", false)
        assertThat(rolledBack.isLiked(post())).isFalse()
        assertThat(rolledBack.likeCount(post())).isEqualTo(5)
    }

    @Test
    fun `l'enregistrement ajuste son propre compteur`() {
        val overlay = PostEngagementOverlay().withBookmark("p1", true)
        assertThat(overlay.isBookmarked(post())).isTrue()
        assertThat(overlay.bookmarkCount(post())).isEqualTo(3)
    }

    @Test
    fun `un repost est append-only et ne persiste que confirme`() {
        val tapped = PostEngagementOverlay().withRepost("p1")
        assertThat(tapped.isReposted(post())).isTrue()
        assertThat(tapped.repostCount(post())).isEqualTo(2)
        val refused = tapped.withoutRepost("p1")
        assertThat(refused.isReposted(post())).isFalse()
        assertThat(refused.repostCount(post())).isEqualTo(1)
    }

    @Test
    fun `un repost deja fait ne se rebascule pas`() {
        val overlay = PostEngagementOverlay()
        assertThat(overlay.canRepost(post(reposted = true))).isFalse()
        assertThat(overlay.withRepost("p1").canRepost(post())).isFalse()
        assertThat(overlay.canRepost(post())).isTrue()
    }

    @Test
    fun `un partage ajoute un au compteur de partages`() {
        val overlay = PostEngagementOverlay().sharedOnce("p1").sharedOnce("p1")
        assertThat(overlay.shareCount(post(shares = 3))).isEqualTo(5)
    }

    @Test
    fun `un partage refuse reprend son cran`() {
        val overlay = PostEngagementOverlay().sharedOnce("p1").unsharedOnce("p1")
        assertThat(overlay.shareCount(post(shares = 3))).isEqualTo(3)
        assertThat(overlay.shareDelta).isEmpty()
    }

    @Test
    fun `le total absolu d'un autre devient la base et laisse ma surcharge`() {
        val mine = PostEngagementOverlay().withLike("p1", true)
        val base = PostEngagementPatches.liked(post(likes = 5), absolute = 9, actorIsMe = false, liked = true)
        assertThat(base.likeCount).isEqualTo(9)
        assertThat(base.isLikedByMe).isFalse()
        assertThat(mine.afterLikeEcho("p1", actorIsMe = false).likeCount(base)).isEqualTo(10)
    }

    @Test
    fun `l'echo de ma propre action leve la surcharge et pose le drapeau servi`() {
        val tapped = PostEngagementOverlay().withLike("p1", true)
        val echoed = PostEngagementPatches.liked(post(likes = 5), absolute = 6, actorIsMe = true, liked = true)
        val lifted = tapped.afterLikeEcho("p1", actorIsMe = true)
        assertThat(echoed.isLikedByMe).isTrue()
        assertThat(lifted.likeCount(echoed)).isEqualTo(6)
        assertThat(lifted.isLiked(echoed)).isTrue()
    }

    @Test
    fun `l'echo d'un retrait de moi lache le coeur`() {
        val tapped = PostEngagementOverlay().withLike("p1", false)
        val echoed = PostEngagementPatches.liked(post(likes = 5, liked = true), absolute = 4, actorIsMe = true, liked = false)
        val lifted = tapped.afterLikeEcho("p1", actorIsMe = true)
        assertThat(lifted.isLiked(echoed)).isFalse()
        assertThat(lifted.likeCount(echoed)).isEqualTo(4)
    }

    @Test
    fun `un repost annonce deux fois n'est applique qu'une fois`() {
        val (first, applied1) = PostEngagementOverlay().afterRepostEcho(repostId = "r1", originalPostId = "p1", byMe = false)
        val (_, applied2) = first.afterRepostEcho(repostId = "r1", originalPostId = "p1", byMe = false)
        assertThat(applied1).isTrue()
        assertThat(applied2).isFalse()
    }

    @Test
    fun `l'echo de mon repost leve la surcharge de repost`() {
        val tapped = PostEngagementOverlay().withRepost("p1")
        val (lifted, _) = tapped.afterRepostEcho(repostId = "r1", originalPostId = "p1", byMe = true)
        val served = PostEngagementPatches.reposted(post(reposts = 1), byMe = true)
        assertThat(served.repostCount).isEqualTo(2)
        assertThat(lifted.repostCount(served)).isEqualTo(2)
        assertThat(lifted.isReposted(served)).isTrue()
    }

    @Test
    fun `l'enregistrement servi par la socket leve la surcharge et pose la base absolue`() {
        val tapped = PostEngagementOverlay().withBookmark("p1", true)
        val served = PostEngagementPatches.bookmarked(post(bookmarks = 2), bookmarked = true, absolute = 3)
        val lifted = tapped.afterBookmarkEcho("p1")
        assertThat(lifted.bookmarkCount(served)).isEqualTo(3)
        assertThat(lifted.isBookmarked(served)).isTrue()
    }

    @Test
    fun `le compte de commentaires se patche en absolu`() {
        assertThat(PostEngagementPatches.commentCount(post(), 7).commentCount).isEqualTo(7)
    }

    @Test
    fun `la reconciliation purge les surcharges absentes ou rattrapees par le serveur`() {
        val overlay = PostEngagementOverlay().withLike("p1", true).withLike("gone", true).withBookmark("p2", true)
        val reconciled = overlay.reconciledWith(listOf(post("p1", likes = 6, liked = true), post("p2")))
        assertThat(reconciled.liked).isEmpty()
        assertThat(reconciled.bookmarked).containsExactly("p2", true)
    }
}
