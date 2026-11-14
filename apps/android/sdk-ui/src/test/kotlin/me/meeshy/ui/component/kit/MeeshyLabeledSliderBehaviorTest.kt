package me.meeshy.ui.component.kit

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.test.requestFocus
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K05 — le curseur RENDU : ce que le lecteur d'écran lit, ce que le doigt et le clavier déclenchent, la paire
 * `onEditingChanged` autour de chaque geste. Miroir des témoins de comportement de `MeeshyLabeledSliderTests` (iOS) ; la loi
 * pure est dans [MeeshyLabeledSliderTest].
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyLabeledSliderBehaviorTest {

    @get:Rule
    val compose = createComposeRule()

    private val values = mutableListOf<Float>()
    private val editing = mutableListOf<Boolean>()

    private fun show(content: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme(darkTheme = true) { content() } }
        compose.waitForIdle()
    }

    @Composable
    private fun Contrast(
        initial: Float = 30f,
        neutral: Float? = 0f,
        showsValue: Boolean = true,
        enabled: Boolean = true,
    ) {
        var value by remember { mutableFloatStateOf(initial) }
        MeeshyLabeledSlider(
            label = "Contraste",
            value = value,
            onValueChange = { value = it; values += it },
            valueText = "${value.toInt()}",
            modifier = Modifier.width(SLIDER_WIDTH),
            range = -100f..100f,
            step = 1f,
            showsValue = showsValue,
            neutral = neutral,
            resetLabel = if (neutral == null) null else RESET,
            enabled = enabled,
            onEditingChanged = { editing += it },
        )
    }

    /** Le centre de la valeur lue : au bord de fin de l'en-tête, juste au-dessus de la bande de la piste. */
    private fun valueCentre(): Offset {
        val track = compose.onNodeWithContentDescription("Contraste").getUnclippedBoundsInRoot()
        return with(compose.density) {
            Offset(x = (track.right - 8.dp).toPx(), y = (track.top - 12.dp).toPx())
        }
    }

    // region Le nom, le rôle et la valeur

    @Test
    fun `un seul element porte le nom, la valeur lue et la plage, meme sans valeur visible`() {
        show { Contrast(showsValue = false) }

        compose.onNodeWithContentDescription("Contraste")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "30"))
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo))
            .assert(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress))
    }

    @Test
    fun `l'action de remise n'existe qu'avec un neutre`() {
        show { Contrast(neutral = null) }

        compose.onNodeWithContentDescription("Contraste")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsActions.CustomActions))
    }

    @Test
    fun `l'action de remise nommee remet au neutre, en une paire d'edition`() {
        show { Contrast() }

        val action = compose.onNodeWithContentDescription("Contraste").fetchSemanticsNode()
            .config[SemanticsActions.CustomActions].single()
        assertThat(action.label).isEqualTo(RESET)
        compose.runOnIdle { action.action() }

        assertThat(values).containsExactly(0f)
        assertThat(editing).containsExactly(true, false).inOrder()
    }

    @Test
    fun `desactive, le curseur est annonce comme tel et ne se regle pas`() {
        show { Contrast(enabled = false) }

        compose.onNodeWithContentDescription("Contraste")
            .assertIsNotEnabled()
            .assert(SemanticsMatcher.keyNotDefined(SemanticsActions.SetProgress))
            .performTouchInput { swipeRight() }

        assertThat(values).isEmpty()
        assertThat(editing).isEmpty()
    }

    // endregion

    // region Le doigt

    @Test
    fun `deux touchers sur la valeur la remettent au neutre, en une paire d'edition`() {
        show { Contrast() }

        compose.onRoot().performTouchInput { doubleClick(valueCentre()) }
        compose.waitForIdle()

        assertThat(values).containsExactly(0f)
        assertThat(editing).containsExactly(true, false).inOrder()
    }

    @Test
    fun `sans neutre, deux touchers sur la valeur ne changent rien`() {
        show { Contrast(neutral = null) }

        compose.onRoot().performTouchInput { doubleClick(valueCentre()) }
        compose.waitForIdle()

        assertThat(values).isEmpty()
        assertThat(editing).isEmpty()
    }

    @Test
    fun `glisser a l'horizontale regle la valeur entre une paire d'edition`() {
        show { Contrast() }

        compose.onNodeWithContentDescription("Contraste").performTouchInput { swipeRight() }
        compose.waitForIdle()

        assertThat(values).isNotEmpty()
        assertThat(values.last()).isEqualTo(100f)
        assertThat(editing.first()).isTrue()
        assertThat(editing.last()).isFalse()
        assertThat(editing.count { it }).isEqualTo(1)
    }

    @Test
    fun `le curseur qui disparait doigt pose clot l'edition`() {
        var shown by mutableStateOf(true)
        show { if (shown) Contrast() }

        compose.onNodeWithContentDescription("Contraste").performTouchInput {
            down(centerLeft + Offset(40f, 0f))
            moveBy(Offset(80f, 0f))
            moveBy(Offset(80f, 0f))
        }
        compose.waitForIdle()
        assertThat(editing).containsExactly(true)

        shown = false
        compose.waitForIdle()

        assertThat(editing).containsExactly(true, false).inOrder()
    }

    // endregion

    // region Le clavier

    @Test
    fun `une fleche avance d'un pas, en une paire d'edition`() {
        show { Contrast() }

        compose.onNodeWithContentDescription("Contraste").requestFocus().performKeyInput { pressKey(Key.DirectionRight) }
        compose.waitForIdle()

        assertThat(values).containsExactly(31f)
        assertThat(editing).containsExactly(true, false).inOrder()
    }

    @Test
    fun `Suppr et retour arriere remettent au neutre`() {
        show { Contrast() }

        val node = compose.onNodeWithContentDescription("Contraste").requestFocus()
        node.performKeyInput { pressKey(Key.Backspace) }
        compose.waitForIdle()
        assertThat(values).containsExactly(0f)

        node.performKeyInput { pressKey(Key.DirectionRight) }
        node.performKeyInput { pressKey(Key.Delete) }
        compose.waitForIdle()

        assertThat(values).containsExactly(0f, 1f, 0f).inOrder()
    }

    // endregion

    private companion object {
        const val RESET = "Remettre à zéro"
        val SLIDER_WIDTH = 300.dp
    }
}
