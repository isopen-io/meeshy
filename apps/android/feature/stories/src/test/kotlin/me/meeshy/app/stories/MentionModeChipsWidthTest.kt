package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostReferenceDisplay
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #14197 — recette S8 : sur 360 dp, en français, la puce « En silence » du panneau Mentionner se coupait en plein mot. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MentionModeChipsWidthTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a 360 dp chaque mode tient sur une ligne, entier et dans l'ecran`() {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.requiredWidth(360.dp)) { MentionModeChoice(mode = PostReferenceDisplay.PINNED, onMode = {}) }
            }
        }

        listOf("Sur la scène", "Dans « Avec … »", "En silence").forEach { label ->
            val node = compose.onNodeWithText(label, useUnmergedTree = true)
            val layouts = mutableListOf<TextLayoutResult>()
            node.fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
            val layout = layouts.single()
            assertThat(layout.lineCount).isEqualTo(1)
            assertThat(layout.isLineEllipsized(0)).isFalse()
            assertThat(node.getUnclippedBoundsInRoot().right).isAtMost(360.dp)
        }
    }
}
