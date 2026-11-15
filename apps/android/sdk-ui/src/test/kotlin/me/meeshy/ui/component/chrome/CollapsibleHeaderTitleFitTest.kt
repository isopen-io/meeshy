package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CollapsibleHeaderTitleFitTest {

    @get:Rule
    val compose = createComposeRule()

    private val title = "Packs et téléchargements"

    @Test
    fun `the shrink stops at the iOS floor`() {
        var scale = 1f
        repeat(10) { scale = CollapsibleHeaderTitleFit.shrunk(scale) }

        assertThat(scale).isEqualTo(CollapsibleHeaderTitleFit.MIN_SCALE)
    }

    @Test
    fun `a long title on a narrow header is read whole, never ellipsized`() {
        compose.setContent {
            MeeshyTheme { CollapsibleHeader(title = title, scrollOffsetDp = 0f, modifier = Modifier.width(240.dp), onBack = {}) }
        }
        compose.waitForIdle()

        val layout = mutableListOf<TextLayoutResult>()
        val node = compose.onNodeWithText(title).fetchSemanticsNode()
        node.config[SemanticsActions.GetTextLayoutResult].action?.invoke(layout)

        assertThat(layout.single().hasVisualOverflow).isFalse()
    }
}
