package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMediaType
import org.junit.Test

class PostDetailMediaGridTest {

    private fun visuals(count: Int) = (1..count).map { feedMediaItem(id = "m$it", type = if (it % 2 == 0) FeedMediaType.VIDEO else FeedMediaType.IMAGE) }

    @Test
    fun `sans visuel il n'y a pas de grille`() {
        assertThat(PostDetailMediaGrid.plan(emptyList())).isNull()
    }

    @Test
    fun `de un a quatre visuels la grille prend la forme de iOS et aucune cellule ne porte de plus-N`() {
        val shapes = (1..4).map { PostDetailMediaGrid.plan(visuals(it))!! }

        assertThat(shapes.map { it.shape }).containsExactly(
            DetailGridShape.ONE, DetailGridShape.TWO, DetailGridShape.THREE, DetailGridShape.FOUR,
        ).inOrder()
        assertThat(shapes.map { it.shape.heightDp }).containsExactly(240, 200, 240, 240).inOrder()
        assertThat(shapes.flatMap { it.cells }.map { it.overflow }.toSet()).containsExactly(0)
    }

    @Test
    fun `au dela de quatre la quatrieme cellule porte le nombre de visuels caches`() {
        val five = PostDetailMediaGrid.plan(visuals(5))!!
        val six = PostDetailMediaGrid.plan(visuals(6))!!

        assertThat(five.cells).hasSize(4)
        assertThat(five.cells.map { it.overflow }).containsExactly(0, 0, 0, 1).inOrder()
        assertThat(six.cells.map { it.overflow }).containsExactly(0, 0, 0, 2).inOrder()
        assertThat(six.moreLabelCount).isEqualTo(6)
    }

    @Test
    fun `un toucher cible le rang du media parmi les visuels du post`() {
        val plan = PostDetailMediaGrid.plan(visuals(6))!!

        assertThat(plan.cells.map { it.galleryIndex }).containsExactly(0, 1, 2, 3).inOrder()
        assertThat(plan.cells[3].item.id).isEqualTo("m4")
    }

    @Test
    fun `un media seul garde son rendu propre sans grille`() {
        val layout = PostDetailMediaGrid.layout(listOf(feedMediaItem(id = "a", type = FeedMediaType.AUDIO)))

        assertThat(layout).isInstanceOf(PostDetailMediaLayout.Single::class.java)
    }

    @Test
    fun `plusieurs medias separent grille visuelle puis audios puis documents`() {
        val media = listOf(
            feedMediaItem(id = "d", type = FeedMediaType.DOCUMENT),
            feedMediaItem(id = "i1"),
            feedMediaItem(id = "a", type = FeedMediaType.AUDIO),
            feedMediaItem(id = "v", type = FeedMediaType.VIDEO),
        )

        val layout = PostDetailMediaGrid.layout(media) as PostDetailMediaLayout.Multi

        assertThat(layout.grid!!.cells.map { it.item.id }).containsExactly("i1", "v").inOrder()
        assertThat(layout.audios.map { it.id }).containsExactly("a")
        assertThat(layout.documents.map { it.id }).containsExactly("d")
    }

    @Test
    fun `un lot sans visuel n'a pas de grille mais garde ses audios`() {
        val layout = PostDetailMediaGrid.layout(
            listOf(feedMediaItem(id = "a1", type = FeedMediaType.AUDIO), feedMediaItem(id = "a2", type = FeedMediaType.AUDIO)),
        ) as PostDetailMediaLayout.Multi

        assertThat(layout.grid).isNull()
        assertThat(layout.audios).hasSize(2)
    }
}
