package me.meeshy.ui.component.kit

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K04 — la rangée de puces rendue : ce que le lecteur d'écran lit, ce que le doigt déclenche, la cible tactile, et que
 * changer la sélection ne recompose que les puces dont l'état change. Miroir des témoins de comportement de
 * `MeeshyChipRowTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyChipRowBehaviorTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(content: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme(darkTheme = false) { content() } }
        compose.waitForIdle()
    }

    private val effects = listOf("none" to "Aucun", "fade" to "Fondu", "zoom" to "Zoom").map { (id, title) -> MeeshyChip(id = id, title = title) }

    // region Le nom, le role et la valeur

    @Test
    fun `un choix simple est un bouton radio, la courante est selectionnee`() {
        show { MeeshyChipRow(effects, setOf("fade"), "Effet", onChange = { _, _ -> }) }

        compose.onNodeWithContentDescription("Fondu")
            .assertHasClickAction()
            .assertIsSelected()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
        compose.onNodeWithContentDescription("Zoom").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, false))
    }

    @Test
    fun `un choix multiple est une bascule, et des onglets sont des onglets`() {
        show {
            MeeshyChipRow(effects, setOf("fade"), "Effet", onChange = { _, _ -> }, mode = MeeshyChipRowMode.Multiple)
            MeeshyChipRow(
                effects.map { it.copy(id = "tab-${it.id}", title = "Onglet ${it.title}") }, setOf("tab-fade"), "Onglets",
                onChange = { _, _ -> }, semantics = MeeshyChipRowSemantics.Tabs,
            )
        }

        compose.onNodeWithContentDescription("Fondu")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Checkbox))
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.ToggleableState))
        compose.onNodeWithContentDescription("Onglet Fondu")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab))
            .assertIsSelected()
    }

    @Test
    fun `une action est un bouton et un menu une liste, ni l'un ni l'autre n'est selectionne`() {
        val chips = listOf(
            MeeshyChip(id = "go", title = "Ajouter", kind = MeeshyChipKind.Action),
            MeeshyChip(id = "lang", title = "Langue", kind = MeeshyChipKind.Menu, trailing = MeeshyChipTrailing.Chevron, hint = "Ouvre la liste"),
        )
        show { MeeshyChipRow(chips, setOf("go", "lang"), "Actions", onChange = { _, _ -> }) }

        compose.onNodeWithContentDescription("Ajouter").assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
        compose.onNodeWithContentDescription("Langue").assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.DropdownList))
        compose.onNodeWithContentDescription("Ajouter").assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
    }

    @Test
    fun `une puce sans titre est nommee par son accessibilityLabel, le glyphe n'est pas lu`() {
        val chips = listOf(MeeshyChip(id = "s", title = "", icon = MeeshyIcons.Search, accessibilityLabel = "Rechercher"))
        show { MeeshyChipRow(chips, emptySet(), "Outils", onChange = { _, _ -> }) }

        compose.onNodeWithContentDescription("Rechercher").assertHasClickAction()
    }

    @Test
    fun `le groupe porte son nom`() {
        show { MeeshyChipRow(effects, setOf("fade"), "Effet d'ouverture", onChange = { _, _ -> }) }

        compose.onNodeWithContentDescription("Effet d'ouverture").assertExists()
    }

    // endregion

    // region Le geste

    @Test
    fun `le toucher d'une autre puce rend la selection suivante et la puce touchee, une fois`() {
        val changes = mutableListOf<Pair<Set<String>, String>>()
        show { MeeshyChipRow(effects, setOf("fade"), "Effet", onChange = { next, tapped -> changes += next to tapped }) }

        compose.onNodeWithContentDescription("Zoom").performClick()

        assertThat(changes).containsExactly(setOf("zoom") to "zoom")
    }

    @Test
    fun `en choix simple, la courante ne repond pas`() {
        var calls = 0
        show { MeeshyChipRow(effects, setOf("fade"), "Effet", onChange = { _, _ -> calls++ }) }

        compose.onNodeWithContentDescription("Fondu").performClick()

        assertThat(calls).isEqualTo(0)
    }

    @Test
    fun `en choix multiple, le toucher bascule`() {
        val changes = mutableListOf<Set<String>>()
        show { MeeshyChipRow(effects, setOf("fade"), "Effet", onChange = { next, _ -> changes += next }, mode = MeeshyChipRowMode.Multiple) }

        compose.onNodeWithContentDescription("Zoom").performClick()
        compose.onNodeWithContentDescription("Fondu").performClick()

        assertThat(changes).containsExactly(setOf("fade", "zoom"), emptySet<String>()).inOrder()
    }

    @Test
    fun `une action part par onAction, jamais par onChange`() {
        val chips = listOf(MeeshyChip(id = "go", title = "Ajouter", kind = MeeshyChipKind.Action))
        val actions = mutableListOf<String>()
        var changes = 0
        show { MeeshyChipRow(chips, emptySet(), "Actions", onChange = { _, _ -> changes++ }, onAction = { actions += it }) }

        compose.onNodeWithContentDescription("Ajouter").performClick()

        assertThat(actions).containsExactly("go")
        assertThat(changes).isEqualTo(0)
    }

    @Test
    fun `desactivee, la rangee est annoncee et non activable`() {
        var calls = 0
        show { MeeshyChipRow(effects, setOf("fade"), "Effet", onChange = { _, _ -> calls++ }, enabled = false) }

        compose.onNodeWithContentDescription("Zoom").assertIsNotEnabled().performClick()

        assertThat(calls).isEqualTo(0)
    }

    @Test
    fun `une puce desactivee ne declenche rien, ses voisines si`() {
        val chips = effects.map { if (it.id == "zoom") it.copy(isEnabled = false) else it }
        val taps = mutableListOf<String>()
        show { MeeshyChipRow(chips, setOf("fade"), "Effet", onChange = { _, tapped -> taps += tapped }) }

        compose.onNodeWithContentDescription("Zoom").assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription("Aucun").performClick()

        assertThat(taps).containsExactly("none")
    }

    // endregion

    // region La mise en page

    @Test
    fun `la cible tactile atteint 48 dp, en regulier comme en compact`() {
        show {
            MeeshyChipRow(effects, setOf("fade"), "Effet", onChange = { _, _ -> })
            MeeshyChipRow(
                effects.map { it.copy(id = "c-${it.id}", title = "C ${it.title}") }, setOf("c-fade"), "Compact",
                onChange = { _, _ -> }, size = MeeshyChipRowSize.Compact,
            )
        }

        listOf("Fondu", "C Fondu").forEach {
            compose.onNodeWithContentDescription(it).assertHeightIsAtLeast(48.dp).assertWidthIsAtLeast(48.dp)
        }
    }

    @Test
    fun `une rangee sans puce ne rend rien - ni hauteur ni marge`() {
        show {
            Box(Modifier.testTag("host")) {
                MeeshyChipRow(emptyList<MeeshyChip<String>>(), emptySet(), "Vide", onChange = { _, _ -> }, inset = 16.dp)
            }
        }

        compose.onNodeWithTag("host").assertHeightIsEqualTo(0.dp)
    }

    @Test
    fun `repliee, une puce plus large que la rangee s'y borne`() {
        val chips = listOf(MeeshyChip(id = "long", title = "Un titre de puce bien plus large que la rangée qui le porte, sur une seule ligne"))
        show {
            Box(Modifier.width(120.dp).testTag("host")) {
                MeeshyChipRow(chips, emptySet(), "Long", onChange = { _, _ -> }, layout = MeeshyChipRowLayout.Wrap)
            }
        }

        val bounds = compose.onNodeWithContentDescription("Un titre de puce bien plus large que la rangée qui le porte, sur une seule ligne")
            .getUnclippedBoundsInRoot()
        assertThat(bounds.right - bounds.left).isAtMost(120.dp)
    }

    // endregion

    // region La performance

    @Test
    fun `changer la selection ne recompose que les puces dont l'etat change`() {
        val counts = mutableMapOf<String, Int>()
        val label: @Composable (MeeshyChip<String>, Color) -> Unit = { chip, ink ->
            counts[chip.id] = (counts[chip.id] ?: 0) + 1
            Text(chip.title, color = ink)
        }
        var selection by mutableStateOf(setOf("none"))
        show { MeeshyChipRow(effects, selection, "Effet", onChange = { _, _ -> }, chipLabel = label) }
        compose.waitForIdle()
        val before = counts.toMap()

        selection = setOf("fade")
        compose.waitForIdle()

        assertThat(counts.getValue("none")).isGreaterThan(before.getValue("none"))
        assertThat(counts.getValue("fade")).isGreaterThan(before.getValue("fade"))
        assertThat(counts.getValue("zoom")).isEqualTo(before.getValue("zoom"))
    }

    @Test
    fun `les bords d'un defilement inconnu ne cachent rien, puis suivent la loi`() {
        assertThat(scrollEdgesOf(value = 0, maxValue = Int.MAX_VALUE)).isEqualTo(MeeshyScrollEdges.None)
        assertThat(scrollEdgesOf(value = 0, maxValue = 0)).isEqualTo(MeeshyScrollEdges.None)
        assertThat(scrollEdgesOf(value = 0, maxValue = 410)).isEqualTo(MeeshyScrollEdges(start = false, end = true))
        assertThat(scrollEdgesOf(value = 200, maxValue = 410)).isEqualTo(MeeshyScrollEdges(start = true, end = true))
        assertThat(scrollEdgesOf(value = 410, maxValue = 410)).isEqualTo(MeeshyScrollEdges(start = true, end = false))
    }

    // endregion

    // region Montrer la courante

    @Test
    fun `la courante est centree dans la fenetre, bornee a la course du defilement`() {
        val geometry = ChipRowGeometry<String>().apply {
            viewportPx = 300
            listOf("a", "b", "c", "d").forEach { widths[it] = 100 }
        }
        val order = listOf("a", "b", "c", "d")

        assertThat(geometry.centeredOffset(order, "a", insetPx = 0f, gapPx = 10f, maxValue = 140)).isEqualTo(0)
        assertThat(geometry.centeredOffset(order, "c", insetPx = 0f, gapPx = 10f, maxValue = 140)).isEqualTo(120)
        assertThat(geometry.centeredOffset(order, "d", insetPx = 0f, gapPx = 10f, maxValue = 140)).isEqualTo(140)
        assertThat(geometry.centeredOffset(order, "c", insetPx = 20f, gapPx = 10f, maxValue = 140)).isEqualTo(140)
        assertThat(geometry.centeredOffset(order, "absente", insetPx = 0f, gapPx = 10f, maxValue = 140)).isNull()
    }

    // endregion
}
