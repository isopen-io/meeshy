package me.meeshy.feature.kit

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * La liste n'affiche que les composants livrés, toucher une ligne ouvre le détail, le retour est celui du système,
 * la tuile pressée suit la tuile vivante, et les réglages ne touchent que le détail (fiche K00 §3 et §4).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class KitCatalogScreenTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val entries = listOf(
        MeeshyKitCatalogEntry("K01", "MeeshyGlassTone"),
        MeeshyKitCatalogEntry(
            "K02",
            "MeeshyGlassButton",
            listOf(
                MeeshyKitCatalogState(id = "repos", boardView = "R1"),
                MeeshyKitCatalogState(id = "actif", boardView = "R3", isTouchable = true),
            ),
        ),
        MeeshyKitCatalogEntry("K03", "MeeshySegmented", listOf(MeeshyKitCatalogState(id = "deux"))),
    )

    private val stub: KitTileContent = { key, state, pressed ->
        Text("$key/${state.id}/${if (pressed) "presse" else "vivant"}", Modifier.size(80.dp, 24.dp))
    }

    private fun show(initialKey: String? = null, entries: List<MeeshyKitCatalogEntry> = this.entries) {
        compose.setContent { MeeshyTheme(darkTheme = true) { KitCatalogScreen(initialKey = initialKey, entries = entries, tileContent = stub) } }
    }

    private fun pressSystemBack() = compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }

    @Test
    fun `la liste n'affiche que les composants livres, dans l'ordre`() {
        show()

        compose.onNodeWithText("K02 MeeshyGlassButton").assertIsDisplayed()
        compose.onNodeWithText("K03 MeeshySegmented").assertIsDisplayed()
        compose.onAllNodesWithText("K01 MeeshyGlassTone").assertCountEquals(0)
    }

    @Test
    fun `une ligne est un bouton`() {
        show()

        compose.onNodeWithText("K02 MeeshyGlassButton")
            .assertHasClickAction()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
    }

    @Test
    fun `aucun composant livre dit la phrase de l'etat vide`() {
        show(entries = entries.take(1))

        compose.onNodeWithText(KitCatalogLabels.EMPTY).assertIsDisplayed()
    }

    @Test
    fun `toucher une ligne ouvre le detail, une tuile par etat et la tuile pressee apres la vivante`() {
        show()

        compose.onNodeWithText("K02 MeeshyGlassButton").performClick()

        compose.onNodeWithText("repos · R1").assertIsDisplayed()
        compose.onNodeWithText("actif · R3").assertIsDisplayed()
        compose.onNodeWithText("actif · R3 · isPressed").assertIsDisplayed()
        compose.onNodeWithText("K02/actif/vivant").assertIsDisplayed()
        compose.onNodeWithText("K02/actif/presse").assertIsDisplayed()
        compose.onAllNodesWithText("K02/repos/presse").assertCountEquals(0)
    }

    @Test
    fun `l'argument de lancement ouvre l'entree demandee`() {
        show(initialKey = "k03")

        compose.onNodeWithText("deux").assertIsDisplayed()
        compose.onAllNodesWithText("K02 MeeshyGlassButton").assertCountEquals(0)
    }

    @Test
    fun `une cle inconnue ou non livree laisse la liste`() {
        show(initialKey = "K01")

        compose.onNodeWithText("K02 MeeshyGlassButton").assertIsDisplayed()
    }

    @Test
    fun `le retour du systeme revient a la liste`() {
        show(initialKey = "K02")
        compose.onNodeWithText("repos · R1").assertIsDisplayed()

        pressSystemBack()
        compose.waitForIdle()

        compose.onNodeWithText("K03 MeeshySegmented").assertIsDisplayed()
    }

    @Test
    fun `le bouton retour du detail revient a la liste`() {
        show(initialKey = "K02")

        compose.onNodeWithContentDescription(KitCatalogLabels.BACK).performClick()

        compose.onNodeWithText("K03 MeeshySegmented").assertIsDisplayed()
    }

    @Test
    fun `les reglages s'ouvrent depuis le detail seulement`() {
        show()
        compose.onAllNodesWithContentDescription(KitCatalogLabels.SETTINGS).assertCountEquals(0)

        compose.onNodeWithText("K02 MeeshyGlassButton").performClick()
        compose.onNodeWithContentDescription(KitCatalogLabels.SETTINGS).performClick()

        compose.onNodeWithText(KitCatalogLabels.SETTING_RTL).assertIsDisplayed()
        assertThat(compose.onAllNodesWithText(KitCatalogLabels.SETTING_LARGE_FONT).fetchSemanticsNodes()).hasSize(1)
    }
}
