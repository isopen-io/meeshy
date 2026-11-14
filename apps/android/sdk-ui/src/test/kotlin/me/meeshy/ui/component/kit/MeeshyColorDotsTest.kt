package me.meeshy.ui.component.kit

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K07 — les pastilles de couleur, comportement rendu : la courante seule est cerclée et choisie, un toucher rappelle une
 * fois avec l'identifiant, le désactivé n'agit pas, une liste vide ne rend rien. Miroir de `MeeshyColorDotsTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyColorDotsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun dot(id: String, name: String): MeeshyColorDot =
        MeeshyColorDot(id = id, fill = MeeshyColorDotFill.Solid(Color.White), name = name)

    private val dots: List<MeeshyColorDot> = listOf(dot("rose", "Rose"), dot("bleu", "Bleu"), dot("vert", "Vert"))

    @Composable
    private fun Group(
        items: List<MeeshyColorDot>,
        initial: String?,
        enabled: Boolean,
        onSelect: (String) -> Unit,
        size: MeeshyColorDotSize = MeeshyColorDotSize.S28,
        pressedDot: String? = null,
    ) {
        var selection by remember { mutableStateOf(initial) }
        MeeshyTheme(darkTheme = false) {
            MeeshyColorDots(
                dots = items,
                label = GROUP_LABEL,
                selection = selection,
                size = size,
                enabled = enabled,
                pressedDot = pressedDot,
                onSelect = {
                    selection = it
                    onSelect(it)
                },
            )
        }
    }

    @Test
    fun `la courante est la seule pastille choisie`() {
        compose.setContent { Group(items = dots, initial = "bleu", enabled = true, onSelect = {}) }

        compose.onNodeWithContentDescription("Bleu").assertIsSelected()
        compose.onNodeWithContentDescription("Rose").assertIsNotSelected()
        compose.onNodeWithContentDescription("Vert").assertIsNotSelected()
    }

    @Test
    fun `aucune courante quand la selection est absente de la liste`() {
        compose.setContent { Group(items = dots, initial = "z", enabled = true, onSelect = {}) }

        compose.onAllNodesWithContentDescription("Rose").assertCountEquals(1)
        compose.onNodeWithContentDescription("Rose").assertIsNotSelected()
    }

    @Test
    fun `un toucher rappelle onSelect une fois avec l'identifiant`() {
        val received = mutableListOf<String>()
        compose.setContent { Group(items = dots, initial = null, enabled = true, onSelect = { received += it }) }

        compose.onNodeWithContentDescription("Vert").performClick()

        assertThat(received).containsExactly("vert")
        compose.onNodeWithContentDescription("Vert").assertIsSelected()
    }

    @Test
    fun `desactive, la pastille n'agit pas et s'annonce desactivee`() {
        val received = mutableListOf<String>()
        compose.setContent { Group(items = dots, initial = null, enabled = false, onSelect = { received += it }) }

        compose.onNodeWithContentDescription("Vert").assertIsNotEnabled().performClick()

        assertThat(received).isEmpty()
    }

    @Test
    fun `une pastille active s'annonce activable`() {
        compose.setContent { Group(items = dots, initial = null, enabled = true, onSelect = {}) }

        compose.onNodeWithContentDescription("Bleu").assertIsEnabled()
    }

    @Test
    fun `une liste vide ne rend rien`() {
        compose.setContent { Group(items = emptyList(), initial = null, enabled = true, onSelect = {}) }

        compose.onNodeWithContentDescription(GROUP_LABEL).assertDoesNotExist()
    }

    @Test
    fun `retoucher la courante rappelle onSelect, l'hote decide`() {
        val received = mutableListOf<String>()
        compose.setContent { Group(items = dots, initial = "bleu", enabled = true, onSelect = { received += it }) }

        compose.onNodeWithContentDescription("Bleu").performClick()
        compose.onNodeWithContentDescription("Bleu").performClick()

        assertThat(received).containsExactly("bleu", "bleu")
        compose.onNodeWithContentDescription("Bleu").assertIsSelected()
    }

    @Test
    fun `une pastille sans nom se dit par sa position, jamais par son code`() {
        val unnamed = listOf(dot("rose", "Rose"), MeeshyColorDot(id = "#3498DB", fill = MeeshyColorDotFill.Solid(Color.White)), dot("vert", "Vert"))
        compose.setContent { Group(items = unnamed, initial = null, enabled = true, onSelect = {}) }

        compose.onNodeWithContentDescription("Color 2 of 3").assertIsNotSelected()
        compose.onAllNodesWithContentDescription("#3498DB", substring = true).assertCountEquals(0)
    }

    @Test
    fun `le groupe porte son nom`() {
        compose.setContent { Group(items = dots, initial = null, enabled = true, onSelect = {}) }

        compose.onNodeWithContentDescription(GROUP_LABEL).assertExists()
    }

    @Test
    fun `la grande taille garde la cible de 48 dp`() {
        compose.setContent { Group(items = dots, initial = null, enabled = true, onSelect = {}, size = MeeshyColorDotSize.S32) }

        compose.onNodeWithContentDescription("Bleu").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `la petite taille garde la cible de 48 dp`() {
        compose.setContent { Group(items = dots, initial = null, enabled = true, onSelect = {}, size = MeeshyColorDotSize.S28) }

        compose.onNodeWithContentDescription("Rose").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `le pre-cercle fige ne choisit rien`() {
        val received = mutableListOf<String>()
        compose.setContent { Group(items = dots, initial = "rose", enabled = true, onSelect = { received += it }, pressedDot = "bleu") }

        compose.onNodeWithContentDescription("Bleu").assertIsNotSelected()
        compose.onNodeWithContentDescription("Rose").assertIsSelected()
        assertThat(received).isEmpty()
    }

    private companion object {
        const val GROUP_LABEL = "Couleur du texte"
    }
}
