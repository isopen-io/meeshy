package me.meeshy.ui.component.swipe

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.chrome.SwipeRowLaw
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs

/**
 * #13279 : sur un ecran de 360 dp, chaque libelle revele est entier et centre dans SA cellule de 76 dp.
 * Le « 3 px » releve au S8 n'etait pas un rognage de mise en page : uiautomator rend la part NON COUVERTE
 * d'un noeud Compose, et le bouton flottant du menu recouvrait « Archiver » (#12497).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SwipeActionLabelLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private fun action(label: String) = SwipeAction(icon = MeeshyIcons.Close, label = label, color = Color.Yellow, onClick = {})

    private fun row(leading: List<String>, trailing: List<String>) = compose.setContent {
        CompositionLocalProvider(LocalReduceMotion provides true) {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.requiredWidth(360.dp)) {
                    SwipeableRow(
                        leadingActions = leading.map(::action),
                        trailingActions = trailing.map(::action),
                        coordinator = SwipeRowCoordinator(),
                    ) {
                        Box(Modifier.fillMaxWidth().height(76.dp).testTag(ROW)) { Text("meeshy sama") }
                    }
                }
            }
        }
    }

    private fun assertWholeAndCentred(labels: List<String>) {
        compose.waitForIdle()
        labels.forEach { label ->
            val text = compose.onNodeWithText(label, useUnmergedTree = true)
            val bounds = text.getBoundsInRoot()
            val layouts = mutableListOf<TextLayoutResult>()
            text.fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
            val layout = layouts.single()
            assertThat(layout.isLineEllipsized(layout.lineCount - 1)).isFalse()
            val cell = compose.onNodeWithText(label).getBoundsInRoot()
            assertThat((cell.right - cell.left).value).isWithin(0.5f).of(SwipeRowLaw.ACTION_WIDTH_DP)
            assertThat(bounds.left >= cell.left && bounds.right <= cell.right).isTrue()
            val offCentre = abs(((bounds.left + bounds.right) - (cell.left + cell.right)).value / 2f)
            assertThat(offCentre).isLessThan(1f)
        }
    }

    @Test
    fun `les trois libelles reveles a droite sont entiers et centres dans leur cellule`() {
        val labels = listOf("Archiver", "Non lu", "Masquer")
        row(leading = emptyList(), trailing = labels)

        compose.onNodeWithTag(ROW, useUnmergedTree = true)
            .performTouchInput { swipeLeft(startX = right - 10f, endX = right - 500f, durationMillis = 300) }

        assertWholeAndCentred(labels)
    }

    @Test
    fun `un libelle allemand trop long passe a la ligne dans sa cellule sans deborder sur la voisine`() {
        val labels = listOf("Stummschalten", "Anheften", "Sperren")
        row(leading = labels, trailing = emptyList())

        compose.onNodeWithTag(ROW, useUnmergedTree = true)
            .performTouchInput { swipeRight(startX = left + 10f, endX = left + 500f, durationMillis = 300) }

        assertWholeAndCentred(labels)
    }

    private companion object {
        const val ROW = "swipe-row"
    }
}
