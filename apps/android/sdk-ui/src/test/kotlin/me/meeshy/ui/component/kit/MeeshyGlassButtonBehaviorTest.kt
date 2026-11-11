package me.meeshy.ui.component.kit

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTouchHeightIsEqualTo
import androidx.compose.ui.test.assertTouchWidthIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K02 — le bouton rond de verre rendu : ce que le lecteur d'écran lit, ce que le doigt déclenche, la cible tactile, et
 * que l'appui ne recompose rien. Miroir des témoins de comportement de `MeeshyGlassButtonTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyGlassButtonBehaviorTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(content: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme(darkTheme = false) { content() } }
        compose.waitForIdle()
    }

    private fun word(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    // region Le nom, le role et la valeur

    @Test
    fun `le nom accessible est le libelle et le role est bouton`() {
        show { MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Fermer", onClick = {}) }

        compose.onNodeWithContentDescription("Fermer")
            .assertHasClickAction()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
    }

    @Test
    fun `un glyphe de texte n'est pas lu en plus du nom`() {
        show { MeeshyGlassButton(label = "Style du texte", onClick = {}) { Text("Aa") } }

        compose.onAllNodesWithText("Aa").assertCountEquals(0)
        compose.onNodeWithContentDescription("Style du texte").assertHasClickAction()
    }

    @Test
    fun `une bascule dit Active ou Desactive, suivi de ce que le controle porte deja`() {
        show {
            MeeshyGlassButton(
                icon = MeeshyIcons.Close, label = "Sortie audio", value = "AirPods",
                activation = MeeshyGlassButtonActivation.Toggle(true), onClick = {},
            )
        }

        compose.onNodeWithContentDescription("Sortie audio").assert(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "${word(R.string.a11y_kit_toggle_on)}, AirPods"),
        )
    }

    @Test
    fun `une bascule eteinte dit Desactive sans valeur de plus`() {
        show {
            MeeshyGlassButton(
                icon = MeeshyIcons.Close, label = "Micro", activation = MeeshyGlassButtonActivation.Toggle(false), onClick = {},
            )
        }

        compose.onNodeWithContentDescription("Micro").assert(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, word(R.string.a11y_kit_toggle_off)),
        )
    }

    @Test
    fun `une option choisie est annoncee selectionnee`() {
        show {
            MeeshyGlassButton(
                icon = MeeshyIcons.Close, label = "Stylo", activation = MeeshyGlassButtonActivation.Selected(true), onClick = {},
            )
        }

        compose.onNodeWithContentDescription("Stylo").assertIsSelected()
    }

    @Test
    fun `sans activation ni valeur, aucun etat n'est ajoute au nom`() {
        show { MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Fermer", onClick = {}) }

        compose.onNodeWithContentDescription("Fermer")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.StateDescription))
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.ToggleableState))
    }

    // endregion

    // region Le geste

    @Test
    fun `le toucher declenche l'action une fois`() {
        var taps = 0
        show { MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Fermer", onClick = { taps++ }) }

        compose.onNodeWithContentDescription("Fermer").performClick()

        assertThat(taps).isEqualTo(1)
    }

    @Test
    fun `desactive - annonce et non activable`() {
        var taps = 0
        show { MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Fermer", enabled = false, onClick = { taps++ }) }

        compose.onNodeWithContentDescription("Fermer").assertIsNotEnabled().performClick()

        assertThat(taps).isEqualTo(0)
    }

    @Test
    fun `active - annonce activable`() {
        show { MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Fermer", onClick = {}) }

        compose.onNodeWithContentDescription("Fermer").assertIsEnabled()
    }

    @Test
    fun `l'appui long n'existe que si l'hote en donne un, et ne declenche pas l'action`() {
        var taps = 0
        var longs = 0
        show {
            MeeshyGlassButton(
                icon = MeeshyIcons.Close, label = "Micro", onClick = { taps++ }, onLongPress = { longs++ },
            )
        }

        compose.onNodeWithContentDescription("Micro").performTouchInput { longClick(durationMillis = 800) }
        compose.waitForIdle()

        assertThat(longs).isEqualTo(1)
        assertThat(taps).isEqualTo(0)

        compose.onNodeWithContentDescription("Micro").performTouchInput { click() }
        compose.waitForIdle()

        assertThat(longs).isEqualTo(1)
        assertThat(taps).isEqualTo(1)
    }

    @Test
    fun `l'appui long est toujours offert en action nommee, au nom du bouton par defaut`() {
        show {
            Column {
                MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Micro", onClick = {}, onLongPress = {})
                MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Camera", onClick = {}, onLongPress = {}, longPressLabel = "Changer de camera")
                MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Sans", onClick = {})
            }
        }

        assertThat(longClickLabel("Micro")).isEqualTo("Micro")
        assertThat(longClickLabel("Camera")).isEqualTo("Changer de camera")
        compose.onNodeWithContentDescription("Sans").assert(SemanticsMatcher.keyNotDefined(SemanticsActions.OnLongClick))
    }

    private fun longClickLabel(name: String): String? =
        compose.onNodeWithContentDescription(name).fetchSemanticsNode().config[SemanticsActions.OnLongClick].label

    // endregion

    // region Le doigt

    @Test
    fun `onPressChange dit le doigt pose puis leve`() {
        val reports = mutableListOf<Boolean>()
        show { MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Micro", onClick = {}, onPressChange = { reports += it }) }

        compose.onNodeWithContentDescription("Micro").performTouchInput { down(center) }
        compose.waitForIdle()
        assertThat(reports).containsExactly(true)

        compose.onNodeWithContentDescription("Micro").performTouchInput { up() }
        compose.waitForIdle()
        assertThat(reports).containsExactly(true, false).inOrder()
    }

    @Test
    fun `onPressChange dit leve si le bouton disparait doigt pose`() {
        val reports = mutableListOf<Boolean>()
        var shown by mutableStateOf(true)
        show {
            if (shown) MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Micro", onClick = {}, onPressChange = { reports += it })
        }

        compose.onNodeWithContentDescription("Micro").performTouchInput { down(center) }
        compose.waitForIdle()
        shown = false
        compose.waitForIdle()

        assertThat(reports).containsExactly(true, false).inOrder()
    }

    // endregion

    // region La cible tactile

    @Test
    fun `la cible tactile ne descend jamais sous 48 dp et l'encombrement reste le diametre`() {
        show {
            Column {
                MeeshyGlassButtonSize.entries.forEach { size ->
                    MeeshyGlassButton(icon = MeeshyIcons.Close, label = "Taille ${size.name}", size = size, onClick = {})
                }
            }
        }

        MeeshyGlassButtonSize.entries.forEach { size ->
            compose.onNodeWithContentDescription("Taille ${size.name}")
                .assertWidthIsEqualTo(size.diameterDp.dp)
                .assertHeightIsEqualTo(size.diameterDp.dp)
                .assertTouchWidthIsEqualTo(48.dp)
                .assertTouchHeightIsEqualTo(48.dp)
        }
    }

    // endregion

    // region La fluidite

    @Test
    fun `l'appui et le relache ne recomposent pas le glyphe - ni normal, ni actif`() {
        var glyphCompositions = 0
        show {
            Column {
                listOf(MeeshyGlassButtonKind.Normal, MeeshyGlassButtonKind.Active, MeeshyGlassButtonKind.Soft).forEach { kind ->
                    MeeshyGlassButton(label = "Bouton ${kind.name}", kind = kind, onClick = {}) { glyphCompositions++ }
                }
            }
        }
        val before = glyphCompositions

        listOf(MeeshyGlassButtonKind.Normal, MeeshyGlassButtonKind.Active, MeeshyGlassButtonKind.Soft).forEach { kind ->
            compose.onNodeWithContentDescription("Bouton ${kind.name}").performTouchInput { down(center) }
            compose.waitForIdle()
            compose.onNodeWithContentDescription("Bouton ${kind.name}").performTouchInput { up() }
            compose.waitForIdle()
        }

        assertThat(glyphCompositions).isEqualTo(before)
    }

    // endregion
}
