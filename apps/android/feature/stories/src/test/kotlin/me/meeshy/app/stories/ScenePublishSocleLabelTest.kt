package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14612 — recette S8 (360 dp) : Story et Post cochés, la capsule disait « Publier la story et le … ». Comme iOS
 * (`publishCapsuleLabel`, `lineLimit(2)`), le libellé de plusieurs formats passe sur deux lignes plutôt que de se couper,
 * et la capsule garde sa hauteur de cible tactile. Sur un écran de 360 dp, le socle reçoit 320 dp.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScenePublishSocleLabelTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(label: String) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.width(320.dp)) {
                    ScenePublishSocle(
                        audience = SceneAudience(label = "Public", icon = MeeshyIcons.Globe),
                        onAudience = {},
                        publishLabel = label,
                        canPublish = true,
                        onPublish = {},
                        chevron = { Box(Modifier.size(48.dp)) },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun layoutOf(label: String): TextLayoutResult {
        val results = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(label, useUnmergedTree = true).fetchSemanticsNode()
            .config[SemanticsActions.GetTextLayoutResult].action?.invoke(results)
        return results.single()
    }

    @Test
    fun `the longest publish label is read whole at 360 dp`() {
        val label = "Publier la story, le post et le réel"
        show(label)
        val layout = layoutOf(label)
        val ellipsized = (0 until layout.lineCount).any(layout::isLineEllipsized)
        assertWithMessage("lignes=${layout.lineCount}").that(ellipsized || layout.hasVisualOverflow).isFalse()
        assertThat(layout.lineCount).isAtMost(2)
    }

    @Test
    fun `the story and post label is read whole at 360 dp`() {
        val label = "Publier la story et le post"
        show(label)
        val layout = layoutOf(label)
        assertThat((0 until layout.lineCount).any(layout::isLineEllipsized) || layout.hasVisualOverflow).isFalse()
    }

    @Test
    fun `the capsule keeps a touch target height with two lines`() {
        val label = "Publier la story, le post et le réel"
        show(label)
        val capsule = compose.onNodeWithContentDescription(label).getUnclippedBoundsInRoot()
        val text = compose.onNodeWithText(label, useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertThat(capsule.height).isAtLeast(48.dp)
        assertThat(capsule.top).isAtMost(text.top)
        assertThat(capsule.bottom).isAtLeast(text.bottom)
    }
}
