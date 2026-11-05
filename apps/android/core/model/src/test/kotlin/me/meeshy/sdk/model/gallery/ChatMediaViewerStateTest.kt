package me.meeshy.sdk.model.gallery

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChatMediaViewerStateTest {
    private fun image(id: String) = ViewerPage(id, ViewerPageKind.IMAGE)
    private fun video(id: String) = ViewerPage(id, ViewerPageKind.VIDEO)
    private val mixed = listOf(image("a"), video("b"), image("c"), video("d"))

    @Test
    fun `opening lands on the tapped page and tells its place`() {
        val state = ChatMediaViewerState().open(mixed, startId = "c")

        assertThat(state.isOpen).isTrue()
        assertThat(state.currentIndex).isEqualTo(2)
        assertThat(state.position).isEqualTo(3 to 4)
    }

    @Test
    fun `opening on an unknown id falls back to the first page and an empty list stays closed`() {
        assertThat(ChatMediaViewerState().open(mixed, "zzz").currentId).isEqualTo("a")
        assertThat(ChatMediaViewerState().open(emptyList(), "a").isOpen).isFalse()
    }

    @Test
    fun `swiping across images and videos moves the identity`() {
        val state = ChatMediaViewerState().open(mixed, "a").settle(1).settle(3)

        assertThat(state.currentPage).isEqualTo(video("d"))
        assertThat(state.settle(99)).isEqualTo(state)
    }

    @Test
    fun `a video opens at the inline player position`() {
        val state = ChatMediaViewerState().open(mixed, "b", inlinePositionMs = 7_500L)

        assertThat(state.startPositionMs).isEqualTo(7_500L)
    }

    @Test
    fun `an image never carries a resume position`() {
        assertThat(ChatMediaViewerState().open(mixed, "a", inlinePositionMs = 9_000L).startPositionMs).isEqualTo(0L)
    }

    @Test
    fun `closing hands back the position reached in the viewer to the inline player`() {
        val state = ChatMediaViewerState().open(mixed, "b", 1_000L).recordVideoPosition("b", 42_000L)

        assertThat(state.resumeOnClose()).isEqualTo(VideoResume("b", 42_000L))
        assertThat(state.close().isOpen).isFalse()
        assertThat(state.close().pages).isEmpty()
    }

    @Test
    fun `closing on an image restores nothing`() {
        assertThat(ChatMediaViewerState().open(mixed, "a").resumeOnClose()).isNull()
    }

    @Test
    fun `older pages prepended keep the viewer on the same media`() {
        val state = ChatMediaViewerState().open(mixed, "c")
        val grown = state.replacePages(listOf(image("x"), image("y")) + mixed)

        assertThat(grown.currentId).isEqualTo("c")
        assertThat(grown.currentIndex).isEqualTo(4)
    }

    @Test
    fun `a deleted current page falls to the nearest neighbour and an emptied list closes`() {
        val state = ChatMediaViewerState().open(mixed, "c")

        assertThat(state.replacePages(mixed.filter { it.id != "c" }).currentId).isEqualTo("d")
        assertThat(state.replacePages(emptyList()).isOpen).isFalse()
    }

    @Test
    fun `the render window is bounded around the current page`() {
        assertThat(GalleryRenderWindow.around(0, 12)).isEqualTo(0..1)
        assertThat(GalleryRenderWindow.around(5, 12)).isEqualTo(4..6)
        assertThat(GalleryRenderWindow.around(11, 12)).isEqualTo(10..11)
        assertThat(GalleryRenderWindow.around(0, 0).isEmpty()).isTrue()
    }
}
