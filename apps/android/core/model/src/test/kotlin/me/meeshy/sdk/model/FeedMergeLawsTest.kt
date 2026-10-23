package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedMergeLawsTest {

    private fun post(id: String, minute: Int, liked: Boolean = false, likes: Int = 0) = ApiPost(
        id = id,
        createdAt = "2026-10-01T10:%02d:00.000Z".format(minute),
        isLikedByMe = liked,
        likeCount = likes,
    )

    private fun ids(posts: List<ApiPost>) = posts.map { it.id }

    @Test
    fun `un post temps reel plus recent que la page relue reste en tete`() {
        val fetched = listOf(post("b", 30), post("a", 20))
        val existing = listOf(post("rt", 40), post("b", 30), post("a", 20))

        assertThat(ids(FeedMergeLaws.mergePreservingRealtimeHead(fetched, existing)))
            .containsExactly("rt", "b", "a").inOrder()
    }

    @Test
    fun `une suppression serveur dans la plage relue s'applique`() {
        val fetched = listOf(post("c", 30), post("a", 10))
        val existing = listOf(post("c", 30), post("b", 20), post("a", 10))

        assertThat(ids(FeedMergeLaws.mergePreservingRealtimeHead(fetched, existing)))
            .containsExactly("c", "a").inOrder()
    }

    @Test
    fun `une page relue vide est rendue telle quelle`() {
        assertThat(FeedMergeLaws.mergePreservingRealtimeHead(emptyList(), listOf(post("x", 5)))).isEmpty()
    }

    @Test
    fun `les pages deja chargees plus anciennes que la page relue sont gardees`() {
        val fetched = listOf(post("e", 50), post("d", 40))
        val existing = listOf(post("e", 50), post("d", 40), post("c", 30), post("b", 20))

        assertThat(ids(FeedMergeLaws.mergePreservingLoadedPages(fetched, existing)))
            .containsExactly("e", "d", "c", "b").inOrder()
    }

    @Test
    fun `tete temps reel et pages chargees se combinent sans doublon`() {
        val fetched = listOf(post("e", 50), post("d", 40))
        val existing = listOf(post("rt", 60), post("e", 50), post("d", 40), post("c", 30))

        assertThat(ids(FeedMergeLaws.mergePreservingLoadedPages(fetched, existing)))
            .containsExactly("rt", "e", "d", "c").inOrder()
    }

    @Test
    fun `sans page relue les pages chargees sont rendues vides par la loi de tete`() {
        assertThat(FeedMergeLaws.mergePreservingLoadedPages(emptyList(), listOf(post("a", 1)))).isEmpty()
    }

    @Test
    fun `un like en attente est rejoue sur un instantane perime`() {
        val posts = listOf(post("a", 1, liked = false, likes = 3), post("b", 2, liked = true, likes = 1))

        val replayed = FeedMergeLaws.reapplyPendingLikes(posts, mapOf("a" to true, "b" to false))

        assertThat(replayed[0].isLikedByMe).isTrue()
        assertThat(replayed[0].likeCount).isEqualTo(4)
        assertThat(replayed[1].isLikedByMe).isFalse()
        assertThat(replayed[1].likeCount).isEqualTo(0)
    }

    @Test
    fun `un like deja a jour n'est pas compte deux fois et le compteur reste positif`() {
        val posts = listOf(post("a", 1, liked = true, likes = 3), post("b", 2, liked = true, likes = 0))

        val replayed = FeedMergeLaws.reapplyPendingLikes(posts, mapOf("a" to true, "b" to false))

        assertThat(replayed[0].likeCount).isEqualTo(3)
        assertThat(replayed[1].likeCount).isEqualTo(0)
    }

    @Test
    fun `une page ajoutee ne duplique aucune ligne`() {
        val merged = FeedMergeLaws.appendingPage(listOf(post("a", 3), post("b", 2)), listOf(post("b", 2), post("c", 1)))

        assertThat(ids(merged)).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `une page demandee sous une ancienne generation est ignoree`() {
        val generation = FeedGeneration()
        val token = generation.current()

        generation.advance()

        assertThat(generation.isCurrent(token)).isFalse()
        assertThat(generation.isCurrent(generation.current())).isTrue()
    }
}
