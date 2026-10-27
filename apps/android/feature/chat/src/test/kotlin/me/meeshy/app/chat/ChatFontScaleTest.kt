package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13397 : avec une grande police système, la chrome du fil ne se rogne pas et ne grandit pas sans limite. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChatFontScaleTest {

    @get:Rule
    val compose = createComposeRule()

    private fun setContentAt(fontScale: Float, content: @Composable () -> Unit) {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = fontScale)) {
                MeeshyTheme { content() }
            }
        }
    }

    private fun height(node: SemanticsNodeInteraction): Float {
        val bounds = node.getUnclippedBoundsInRoot()
        return bounds.bottom.value - bounds.top.value
    }

    private fun overflowsWidth(node: SemanticsNodeInteraction): Boolean {
        val results = mutableListOf<TextLayoutResult>()
        node.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(results) }
        return results.single().didOverflowWidth
    }

    @Test
    fun `the composer placeholder fits its capsule at font scale 1_3`() {
        setContentAt(1.3f) {
            Box(Modifier.width(150.dp)) {
                ComposerInputCapsule(
                    value = TextFieldValue(""),
                    onValueChange = {},
                    accentColor = Color.Red,
                    onSend = {},
                    showMic = true,
                )
            }
        }

        assertThat(overflowsWidth(compose.onNodeWithText("Message…"))).isFalse()
    }

    @Test
    fun `the typed text keeps following the system font beyond the chrome cap`() {
        val typed = "Bonjour"
        compose.setContent {
            MeeshyTheme {
                Column {
                    listOf(1.3f, 2.0f).forEach { scale ->
                        CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = scale)) {
                            Box(Modifier.width(300.dp)) {
                                ComposerInputCapsule(
                                    value = TextFieldValue(typed),
                                    onValueChange = {},
                                    accentColor = Color.Red,
                                    onSend = {},
                                    showMic = false,
                                )
                            }
                        }
                    }
                }
            }
        }

        val fields = compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.SetText))

        assertThat(height(fields[1])).isGreaterThan(height(fields[0]))
    }

    @Test
    fun `the day pill does not grow with the system font`() {
        val millis = 1_760_434_200_000L
        compose.setContent {
            MeeshyTheme {
                Column {
                    CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 1.0f)) { DaySeparator(millis) }
                    CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 1.3f)) { DaySeparator(millis) }
                }
            }
        }

        val pills = compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))

        assertThat(height(pills[1])).isEqualTo(height(pills[0]))
    }
}
