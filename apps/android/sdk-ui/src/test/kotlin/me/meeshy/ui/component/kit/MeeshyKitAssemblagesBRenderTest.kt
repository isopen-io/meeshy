package me.meeshy.ui.component.kit

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * K36, K38, K47, K48, K49 rendus : ce que la recette décide, l'écran le fait. Une tuile choisie ne se rechoisit pas, le
 * plafond éteint les tuiles libres, un duo de trois reste visible, une rangée de médias tient en une ligne, une épingle
 * fantôme ne montre personne, et seuls l'erreur et le hors ligne s'annoncent.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MeeshyKitAssemblagesBRenderTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun render(content: @Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalReduceMotion provides true) { content() }
            }
        }
        compose.waitForIdle()
    }

    private val tiles = listOf(MeeshyChoiceItem("a", "Alpha"), MeeshyChoiceItem("b", "Bravo"), MeeshyChoiceItem("c", "Charlie"))

    @Test
    fun `une tuile deja choisie ne se rechoisit pas en selection simple`() {
        val picked = mutableListOf<String>()
        render { MeeshyChoiceTiles(items = tiles, selection = MeeshyChoiceSelection.Single("a"), onSelect = { picked += it }) }
        compose.onNodeWithContentDescription("Alpha").performClick()
        compose.onNodeWithContentDescription("Bravo").performClick()
        assertThat(picked).containsExactly("b")
    }

    @Test
    fun `au plafond d une selection multiple, la tuile libre est eteinte et ne repond pas`() {
        val picked = mutableListOf<String>()
        render {
            MeeshyChoiceTiles(
                items = tiles,
                selection = MeeshyChoiceSelection.Multiple(setOf("a", "b")),
                onSelect = { picked += it },
                maxSelected = 2,
            )
        }
        compose.onNodeWithContentDescription("Charlie").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Charlie").performClick()
        compose.onNodeWithContentDescription("Alpha").performClick()
        assertThat(picked).containsExactly("a")
    }

    @Test
    fun `un duo qui n a pas deux visages se dessine en pile`() {
        render {
            MeeshyAvatarGroup(count = 3, label = "Léa, Marc et Zoé", layout = MeeshyAvatarGroupLayout.Duo) {
                Box(Modifier.size(40.dp))
            }
        }
        compose.onNodeWithContentDescription("Léa, Marc et Zoé").assertExists()
    }

    @Test
    fun `une rangee de medias tient en une seule ligne de colonnes`() {
        render {
            MeeshyMediaGrid(
                tiles = (1..5).map { MeeshyMediaTile(id = "m$it", label = "photo") },
                onOpen = {},
                layout = MeeshyMediaGridLayout.Row,
                columns = 3,
            ) { Box(Modifier.size(10.dp)) }
        }
        assertThat(compose.onAllNodesWithContentDescription("photo").fetchSemanticsNodes()).hasSize(3)
    }

    @Test
    fun `une epingle fantome ne montre personne`() {
        render {
            MeeshyMapPin(label = "Repère", kind = MeeshyMapPinKind.Ghost) { Box(Modifier.size(10.dp).testTag("visage")) }
        }
        compose.onNodeWithContentDescription("Repère").assertExists()
        compose.onNodeWithTag("visage", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `seuls l erreur et le hors ligne s annoncent`() {
        val live = SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion)
        render {
            MeeshyStateBlock(
                kind = MeeshyStateBlockKind.Empty,
                title = "Rien encore",
                primary = MeeshyStateBlockAction("Créer") {},
                label = "vide",
            )
        }
        compose.onNode(hasContentDescription("vide").and(live)).assertDoesNotExist()
        compose.onNodeWithContentDescription("vide").assertExists()
    }

    @Test
    fun `le hors ligne s annonce poliment`() {
        val polite = SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, androidx.compose.ui.semantics.LiveRegionMode.Polite)
        render { MeeshyStateBlock(kind = MeeshyStateBlockKind.Offline, title = "Tu es hors ligne", label = "hors ligne") }
        compose.onNode(hasContentDescription("hors ligne").and(polite)).assertExists()
    }
}
