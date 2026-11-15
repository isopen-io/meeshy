package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #14394 — le rail d'une story vit entre l'en-tête et le haut MESURÉ du composeur épinglé (iOS `sidebarMaxHeight`). */
class StoryRailFrameTest {

    @Test fun `le bas du rail s'arrête au-dessus du composeur épinglé`() {
        val frame = StoryRailFrame.of(headerBottomPx = 200, composerHeightPx = 300, composerPinned = true, gapPx = 16)
        assertThat(frame.bottomPx).isEqualTo(316)
        assertThat(frame.topPx).isEqualTo(216)
    }

    @Test fun `sans composeur épinglé, le rail ne réserve que l'écart`() {
        val frame = StoryRailFrame.of(headerBottomPx = 200, composerHeightPx = 300, composerPinned = false, gapPx = 16)
        assertThat(frame.bottomPx).isEqualTo(16)
    }
}
