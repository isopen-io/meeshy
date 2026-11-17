package me.meeshy.ui.component.kit

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import kotlin.math.abs
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Revue du lot #18885 : ce que la recette annonce, la vue le FAIT. Un verso existe sous « réduire les animations », une rangée
 * sans action n'est pas un bouton, un en-tête sans geste ne se dit pas repliable, l'avatar d'un héros n'est pas recréé au passage
 * dans la barre, une carte de code mini garde son code entier.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MeeshyKitAssemblagesAReviewTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun render(reduceMotion: Boolean = true, fontScale: Float? = null, content: @Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                val density = LocalDensity.current
                val scaled = fontScale?.let { Density(density.density, it) } ?: density
                CompositionLocalProvider(LocalReduceMotion provides reduceMotion, LocalDensity provides scaled) { content() }
            }
        }
        compose.waitForIdle()
    }

    private val noClick = SemanticsMatcher.keyNotDefined(SemanticsActions.OnClick)

    @Test
    fun `sous reduire les animations un billet retourne montre son verso`() {
        render {
            MeeshyTicket(title = "Lien", code = "MSH-42", isFlipped = true, back = { Text("Verso du billet") })
        }
        compose.onNodeWithText("Verso du billet").assertExists()
        compose.onNodeWithText("MSH-42").assertDoesNotExist()
    }

    @Test
    fun `une carte de code mini garde son code entier sans marge de carte`() {
        render {
            Box(Modifier.testTag("hote")) { MeeshyCodeCard(payload = "https://meeshy.me/u/alice", label = "Code", style = MeeshyCodeCardStyle.Plain, size = MeeshyCodeCardSize.Mini) }
        }
        compose.onNodeWithTag("hote").assertWidthIsEqualTo(84.dp).assertHeightIsEqualTo(84.dp)
    }

    @Test
    fun `une carte de code est un seul element nomme par son libelle et dont la legende est la valeur`() {
        render { MeeshyCodeCard(payload = "https://meeshy.me/u/alice", label = "Code de profil", caption = "meeshy.me/alice") }
        compose.onNodeWithContentDescription("Code de profil")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "meeshy.me/alice"))
        compose.onNodeWithText("meeshy.me/alice").assertDoesNotExist()
    }

    @Test
    fun `une rangee selectionnable sans action de l hote n est pas un bouton`() {
        render {
            MeeshyPersonRow(title = "Alice", selection = MeeshyPersonRowSelection.Multiple(isSelected = true), selectedLabel = "choisie")
        }
        compose.onNodeWithContentDescription("Alice, choisie").assert(noClick)
    }

    @Test
    fun `la rangee se dit comme sur iOS nom niveau ligne puis meta d un trait`() {
        render {
            MeeshyPersonRow(title = "Alice", subtitle = "en ligne", levelLabel = "Ami", meta = "12", metaDetail = "min")
        }
        compose.onNodeWithContentDescription("Alice, Ami, en ligne, 12 min").assertExists()
    }

    @Test
    fun `aux grandes tailles de texte la meta passe sous la ligne avec son detail`() {
        render(fontScale = 2f) {
            MeeshyPersonRow(title = "Alice", subtitle = "en ligne", meta = "12", metaDetail = "min")
        }
        compose.onNodeWithText("12", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("min", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `un en tete repliable remet l etat demande a l hote`() {
        val asked = mutableListOf<Boolean>()
        render {
            MeeshySectionHeader(title = "Groupes", isCollapsible = true, isExpanded = false, onToggle = { asked += it }, collapsedLabel = "repliée")
        }
        compose.onNodeWithContentDescription("Groupes").performClick()
        assertThat(asked).containsExactly(true)
    }

    @Test
    fun `un en tete repliable sans geste de l hote ne se dit ni repliable ni touchable`() {
        render {
            MeeshySectionHeader(title = "Groupes", isCollapsible = true, isExpanded = false, collapsedLabel = "repliée")
        }
        compose.onNodeWithContentDescription("Groupes")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.StateDescription))
            .assert(noClick)
    }

    @Test
    fun `l avatar du heros n est pas recree quand l identite passe dans la barre`() {
        var progress by mutableFloatStateOf(0.4f)
        var disposals = 0
        render {
            MeeshyCollapsingHero(
                progress = progress,
                title = "Alice",
                avatar = { _ -> DisposableEffect(Unit) { onDispose { disposals++ } } },
            )
        }
        progress = 0.6f
        compose.waitForIdle()
        assertThat(disposals).isEqualTo(0)
    }

    @Test
    fun `un heros centre centre son titre deplie`() {
        render { MeeshyCollapsingHero(progress = 0f, title = "Alice", alignment = MeeshyCollapsingHeroAlignment.Center) }
        val root = compose.onRoot().getUnclippedBoundsInRoot()
        val title = compose.onNodeWithText("Alice", useUnmergedTree = true).getUnclippedBoundsInRoot()
        val rootCenter = (root.left.value + root.right.value) / 2
        val titleCenter = (title.left.value + title.right.value) / 2
        assertThat(abs(rootCenter - titleCenter)).isLessThan(2f)
    }

    @Test
    fun `replie le heros offre la barre au toucher nommee par son libelle`() {
        var taps = 0
        render {
            MeeshyCollapsingHero(progress = 0.8f, title = "Alice", collapsedTapLabel = "Revenir en haut", onCollapsedTap = { taps++ })
        }
        compose.onNodeWithContentDescription("Revenir en haut").performClick()
        assertThat(taps).isEqualTo(1)
    }
}
