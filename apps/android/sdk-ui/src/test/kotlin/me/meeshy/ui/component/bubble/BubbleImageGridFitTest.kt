package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13376 — une bulle rétrécie (gouttière de sélection, téléphone de 360 dp) réduit la grille, elle ne la rogne pas. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleImageGridFitTest {

    @get:Rule
    val compose = createComposeRule()

    private val images = (0 until 4).map { BubbleImage(attachmentId = "a$it", url = "https://cdn/$it.jpg", alt = "photo $it") }

    private fun render(containerDp: Int) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.width(containerDp.dp)) { BubbleImageGrid(images = images, onImageClick = null) }
            }
        }
        compose.waitForIdle()
    }

    private fun bounds(index: Int) = compose.onNodeWithContentDescription("photo $index").getUnclippedBoundsInRoot()

    @Test
    fun `a narrow bubble keeps the right column inside it, cells staying square`() {
        render(200)
        assertThat(bounds(1).right.value).isAtMost(200.5f)
        assertThat(bounds(3).right.value).isAtMost(200.5f)
        val cell = bounds(0)
        assertThat(cell.width.value).isWithin(1f).of(cell.height.value)
    }

    @Test
    fun `a wide bubble keeps the 252 dp grid`() {
        render(320)
        assertThat(bounds(1).right.value).isWithin(1f).of(252f)
    }
}
