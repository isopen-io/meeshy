package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerLeadingSceneTogglesTest {
    @Test
    fun `the lightning bolt comes before the frame, whatever is served`() {
        assertThat(ComposerLeadingSceneToggles.served(animated = true, frame = true))
            .containsExactly(ComposerSceneToggle.ANIMATED, ComposerSceneToggle.FRAME).inOrder()
    }

    @Test
    fun `a toggle that is not served is absent, never disabled`() {
        assertThat(ComposerLeadingSceneToggles.served(animated = true, frame = false)).containsExactly(ComposerSceneToggle.ANIMATED)
        assertThat(ComposerLeadingSceneToggles.served(animated = false, frame = true)).containsExactly(ComposerSceneToggle.FRAME)
        assertThat(ComposerLeadingSceneToggles.served(animated = false, frame = false)).isEmpty()
    }
}
