package me.meeshy.ui.component.kit

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTouchHeightIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K06 — `MeeshyToggleRow` : la recette en valeurs, le comportement rendu (toute la ligne est la cible, le lecteur
 * d'écran lit titre, sous-titre et état, l'appui déclenche une fois) et la hauteur. Miroir de `MeeshyToggleRowTests`
 * (iOS), témoins de recette et de comportement.
 */
class MeeshyToggleRowTest {

    private fun recipe(
        accessory: MeeshyToggleRowAccessory = MeeshyToggleRowAccessory.None,
        kind: MeeshyToggleRowKind = MeeshyToggleRowKind.Normal,
        tone: MeeshyGlassTone? = null,
        isDark: Boolean = true,
        isEnabled: Boolean = true,
        isPressed: Boolean = false,
        isHovered: Boolean = false,
        tint: Color? = null,
    ): MeeshyToggleRowRecipe = MeeshyToggleRowRecipe.resolve(
        accessory = accessory,
        kind = kind,
        tone = tone,
        isDark = isDark,
        isEnabled = isEnabled,
        isPressed = isPressed,
        isHovered = isHovered,
        tint = tint,
    )

    @Test
    fun `la hauteur minimale de la ligne est de 46 dp quel que soit l'accessoire`() {
        assertThat(recipe(accessory = MeeshyToggleRowAccessory.None).minimumHeight).isEqualTo(46.dp)
        assertThat(recipe(accessory = MeeshyToggleRowAccessory.Toggle(isOn = true)).minimumHeight).isEqualTo(46.dp)
    }

    @Test
    fun `une ligne active garde son contenu plein et une ligne desactivee le baisse a 62 pour cent`() {
        assertThat(recipe(accessory = MeeshyToggleRowAccessory.Chevron).contentOpacity).isEqualTo(1f)
        assertThat(recipe(accessory = MeeshyToggleRowAccessory.Chevron, isEnabled = false).contentOpacity)
            .isWithin(0.001f).of(0.62f)
    }

    @Test
    fun `l'appui pose un voile a 15 pour cent et le survol a 8 pour cent`() {
        assertThat(recipe(isPressed = true).veilOpacity).isWithin(0.001f).of(MeeshyOpacity.light)
        assertThat(recipe(isHovered = true).veilOpacity).isWithin(0.001f).of(MeeshyOpacity.subtle)
    }

    @Test
    fun `une ligne au repos n'a pas de voile et une ligne desactivee n'en a jamais`() {
        assertThat(recipe().veilOpacity).isEqualTo(0f)
        assertThat(recipe(isPressed = true, isEnabled = false).veilOpacity).isEqualTo(0f)
    }

    @Test
    fun `la variante destructive est en rouge d'alerte sur un fond sombre et en encre d'erreur sur un fond clair`() {
        assertThat(recipe(kind = MeeshyToggleRowKind.Destructive, isDark = true).titleColor).isEqualTo(MeeshyPalette.Error)
        assertThat(recipe(kind = MeeshyToggleRowKind.Destructive, tone = MeeshyGlassTone.Theme, isDark = false).titleColor)
            .isEqualTo(MeeshyPalette.ErrorInk)
    }

    @Test
    fun `une ligne de verre sur media prend l'encre blanche`() {
        assertThat(recipe(tone = MeeshyGlassTone.Deep).titleColor).isEqualTo(MeeshyMediaChromeColors.OnMedia)
    }

    @Test
    fun `la variante accent sans teinte prend la couleur de mention`() {
        assertThat(recipe(kind = MeeshyToggleRowKind.Accent, isDark = true).titleColor).isEqualTo(MeeshyPalette.Indigo300)
    }

    @Test
    fun `la variante accent avec une teinte prend la teinte de la conversation`() {
        val tint = Color(0xFF123456)
        assertThat(recipe(kind = MeeshyToggleRowKind.Accent, tint = tint).titleColor).isEqualTo(tint)
    }

    @Test
    fun `une bascule ouverte peint sa piste de la teinte, ou de la marque sans teinte`() {
        val tint = Color(0xFF123456)
        assertThat(recipe(accessory = MeeshyToggleRowAccessory.Toggle(isOn = true), tint = tint).trackOnColor).isEqualTo(tint)
        assertThat(recipe(accessory = MeeshyToggleRowAccessory.Toggle(isOn = true)).trackOnColor).isEqualTo(MeeshyPalette.Indigo500)
    }

    @Test
    fun `le libelle d'accessibilite joint titre et sous-titre`() {
        assertThat(MeeshyToggleRowRecipe.accessibilityLabel(title = "Tendances", subtitle = "Monde"))
            .isEqualTo("Tendances, Monde")
    }

    @Test
    fun `un sous-titre vide ou blanc ne laisse aucune virgule orpheline`() {
        assertThat(MeeshyToggleRowRecipe.accessibilityLabel(title = "Amis", subtitle = "   ")).isEqualTo("Amis")
        assertThat(MeeshyToggleRowRecipe.accessibilityLabel(title = "Amis", subtitle = null)).isEqualTo("Amis")
    }

    @Test
    fun `la valeur lue porte l'etat de la bascule, de la coche et le texte`() {
        assertThat(MeeshyToggleRowRecipe.valueFor(MeeshyToggleRowAccessory.Toggle(isOn = true)))
            .isEqualTo(MeeshyToggleRowValue.Toggle(isOn = true))
        assertThat(MeeshyToggleRowRecipe.valueFor(MeeshyToggleRowAccessory.Check(isSelected = true)))
            .isEqualTo(MeeshyToggleRowValue.Selected(isSelected = true))
        assertThat(MeeshyToggleRowRecipe.valueFor(MeeshyToggleRowAccessory.Value("Wolof")))
            .isEqualTo(MeeshyToggleRowValue.Text("Wolof"))
    }

    @Test
    fun `une coche non retenue n'est pas choisie`() {
        assertThat(MeeshyToggleRowRecipe.isChosen(MeeshyToggleRowAccessory.Check(isSelected = false))).isFalse()
        assertThat(MeeshyToggleRowRecipe.isChosen(MeeshyToggleRowAccessory.Chevron)).isFalse()
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyToggleRowBehaviorTest {

    @get:Rule
    val compose = createComposeRule()

    private fun word(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun show(content: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme(darkTheme = false) { content() } }
        compose.waitForIdle()
    }

    @Test
    fun `toute la ligne est un bouton qui declenche une fois a l'appui`() {
        var taps = 0
        show { MeeshyToggleRow(title = "Partager", onClick = { taps++ }) }

        compose.onNodeWithText("Partager").assertHasClickAction()
        compose.onNodeWithText("Partager").performClick()

        assertThat(taps).isEqualTo(1)
    }

    @Test
    fun `le lecteur d'ecran lit le titre suivi du sous-titre`() {
        show { MeeshyToggleRow(title = "Tendances", subtitle = "Monde", onClick = {}) }

        compose.onNodeWithContentDescription("Tendances, Monde").assertExists()
    }

    @Test
    fun `une bascule annonce activé ou desactivé`() {
        show { MeeshyToggleRow(title = "Muet", accessory = MeeshyToggleRowAccessory.Toggle(isOn = true), onClick = {}) }

        compose.onNodeWithContentDescription("Muet").assert(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, word(R.string.a11y_kit_toggle_on)),
        )
    }

    @Test
    fun `une coche choisie est selectionnee pour le lecteur d'ecran`() {
        show { MeeshyToggleRow(title = "Plage", accessory = MeeshyToggleRowAccessory.Check(isSelected = true), onClick = {}) }

        compose.onNodeWithContentDescription("Plage").assertIsSelected()
    }

    @Test
    fun `une bascule dit son etat par sa valeur, jamais par une selection`() {
        show { MeeshyToggleRow(title = "Muet", accessory = MeeshyToggleRowAccessory.Toggle(isOn = true), onClick = {}) }

        compose.onNodeWithContentDescription("Muet").assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
    }

    @Test
    fun `une coche non retenue est lue non selectionnee`() {
        show { MeeshyToggleRow(title = "Plage", accessory = MeeshyToggleRowAccessory.Check(isSelected = false), onClick = {}) }

        compose.onNodeWithContentDescription("Plage").assertIsNotSelected()
    }

    @Test
    fun `une case cochee est selectionnee pour le lecteur d'ecran`() {
        show { MeeshyToggleRow(title = "Story", accessory = MeeshyToggleRowAccessory.Checkbox(isChecked = true), onClick = {}) }

        compose.onNodeWithContentDescription("Story").assertIsSelected()
    }

    @Test
    fun `une valeur se lit comme l'etat de la ligne`() {
        show { MeeshyToggleRow(title = "Langue du son", accessory = MeeshyToggleRowAccessory.Value("Wolof"), onClick = {}) }

        compose.onNodeWithContentDescription("Langue du son").assert(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Wolof"),
        )
    }

    @Test
    fun `un chevron ne porte ni valeur ni selection`() {
        show { MeeshyToggleRow(title = "Tendances", accessory = MeeshyToggleRowAccessory.Chevron, onClick = {}) }

        compose.onNodeWithContentDescription("Tendances")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.StateDescription))
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
    }

    @Test
    fun `une ligne desactivee ne repond pas au toucher`() {
        var taps = 0
        show { MeeshyToggleRow(title = "Mood", enabled = false, onClick = { taps++ }) }

        compose.onNodeWithText("Mood").assertIsNotEnabled()
        compose.onNodeWithText("Mood").performClick()

        assertThat(taps).isEqualTo(0)
    }

    @Test
    fun `la cible tactile fait au moins 48 dp et la ligne au moins 46 dp`() {
        show { MeeshyToggleRow(title = "Amis", onClick = {}) }

        compose.onNodeWithText("Amis").assertTouchHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Amis").assertHeightIsAtLeast(46.dp)
    }

    @Test
    fun `l appui sur une ligne de colonne declenche la mise a jour de l hote`() {
        var label by mutableStateOf("Avant")
        show {
            Column {
                MeeshyToggleRow(title = label, onClick = { label = "Après" })
            }
        }
        compose.onNodeWithText("Avant").performClick()
        compose.waitForIdle()

        compose.onAllNodesWithText("Après").assertCountEquals(1)
    }
}
