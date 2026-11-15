package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryToolModeTest {
    @Test
    fun `the canonical order has seven tools minus the global filter in creation dressing editing order`() {
        assertThat(StoryToolMode.composerOrder).containsExactly(
            StoryToolMode.MEDIA, StoryToolMode.TEXT, StoryToolMode.DRAWING,
            StoryToolMode.AUDIO, StoryToolMode.TEXTURE, StoryToolMode.TIMELINE,
        ).inOrder()
        assertThat(StoryToolMode.composerOrder).doesNotContain(StoryToolMode.FILTERS)
    }

    @Test
    fun `a tool without a panel is not served and the canonical order is kept`() {
        val served = StoryToolMode.served(setOf(StoryToolMode.TEXTURE, StoryToolMode.MEDIA, StoryToolMode.FILTERS))
        assertThat(served).containsExactly(StoryToolMode.MEDIA, StoryToolMode.TEXTURE).inOrder()
        assertThat(StoryToolMode.served(emptySet())).isEmpty()
    }
}
