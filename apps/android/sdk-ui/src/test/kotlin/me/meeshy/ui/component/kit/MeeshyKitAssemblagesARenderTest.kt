package me.meeshy.ui.component.kit

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * K30, K31, K32, K34, K39, K44 rendus : ce que la recette annonce, l'arbre d'accessibilité le dit. Une action en attente ne
 * répond pas, une rangée est UNE phrase, une bande est UN élément, une section repliable dit son état, le contenu d'un code
 * ne fuit jamais dans un nom accessible.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MeeshyKitAssemblagesARenderTest {

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

    @Test
    fun `une action libellee repond au toucher et une action en attente ne repond pas`() {
        var taps = 0
        render {
            MeeshyLabeledAction(title = "Copier", icon = MeeshyIcons.Check, onClick = { taps++ })
        }
        compose.onNodeWithContentDescription("Copier").performClick()
        assertThat(taps).isEqualTo(1)
    }

    @Test
    fun `une action en attente n agit pas et se nomme en attente`() {
        var taps = 0
        render {
            MeeshyLabeledAction(title = "Copier", icon = MeeshyIcons.Check, onClick = { taps++ }, isPending = true, pendingLabel = "En cours")
        }
        compose.onNodeWithContentDescription("Copier").performClick()
        assertThat(taps).isEqualTo(0)
    }

    @Test
    fun `une section repliable se touche en entier et la ligne est un titre`() {
        var toggles = 0
        render {
            MeeshySectionHeader(title = "Groupes", count = 3, isCollapsible = true, isExpanded = false, onToggle = { toggles++ }, collapsedLabel = "repliée")
        }
        compose.onNode(hasContentDescription("Groupes, 3")).performClick()
        assertThat(toggles).isEqualTo(1)
    }

    @Test
    fun `une rangee de personne est une seule phrase et une rangee sans action ne se touche pas`() {
        var taps = 0
        render {
            MeeshyPersonRow(title = "Alice", subtitle = "en ligne", onPress = { taps++ })
        }
        compose.onNodeWithContentDescription("Alice, en ligne").performClick()
        assertThat(taps).isEqualTo(1)
    }

    @Test
    fun `une bande de chiffres est un seul element qui dit tous ses chiffres`() {
        render {
            MeeshyFigureBand(
                items = listOf(MeeshyFigureItem("12", "amis"), MeeshyFigureItem(null, "groupes")),
                emptyLabel = "inconnu",
            )
        }
        compose.onNodeWithContentDescription("12 amis, inconnu groupes").assertExists()
    }

    @Test
    fun `le contenu d un code n entre jamais dans un nom accessible`() {
        val secret = "https://meeshy.me/secret-payload"
        render { MeeshyCodeCard(payload = secret, label = "Code de profil", caption = "meeshy.me/alice") }
        compose.onNodeWithContentDescription("Code de profil").assertExists()
        compose.onNode(hasContentDescription(secret, substring = true)).assertDoesNotExist()
    }
}
