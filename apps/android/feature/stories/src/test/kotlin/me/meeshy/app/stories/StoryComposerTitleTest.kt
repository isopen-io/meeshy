package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le titre « Nouvelle story » tient sur UNE ligne, même quand les actions de la barre lui laissent peu de place (#13639). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryComposerTitleTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the title is laid out on one line and ellipsized when the actions leave it little room`() {
        var layout: TextLayoutResult? = null
        compose.setContent {
            Box(Modifier.width(24.dp)) { StoryComposerTitle(onTextLayout = { layout = it }) }
        }
        compose.waitForIdle()
        assertThat(layout?.layoutInput?.maxLines).isEqualTo(1)
        assertThat(layout?.layoutInput?.overflow).isEqualTo(TextOverflow.Ellipsis)
        assertThat(layout?.lineCount).isEqualTo(1)
    }
}
