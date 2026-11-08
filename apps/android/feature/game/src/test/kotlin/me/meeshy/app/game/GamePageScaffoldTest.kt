package me.meeshy.app.game

import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GamePageScaffoldTest {

    @get:Rule val compose = createComposeRule()

    @Test
    fun `au repos le grand titre est affiche`() {
        assertThat(GamePageHeaderMode.of(scrollPx = 0, density = 2f)).isEqualTo(GamePageHeaderMode.Expanded)
    }

    @Test
    fun `en defilant au dela de la moitie de la course la barre devient compacte`() {
        assertThat(GamePageHeaderMode.of(scrollPx = 10, density = 2f)).isEqualTo(GamePageHeaderMode.Expanded)
        assertThat(GamePageHeaderMode.of(scrollPx = 400, density = 2f)).isEqualTo(GamePageHeaderMode.Compact)
    }

    @Test
    fun `un decalage negatif ou une densite nulle restent au repos`() {
        assertThat(GamePageHeaderMode.of(scrollPx = -50, density = 2f)).isEqualTo(GamePageHeaderMode.Expanded)
        assertThat(GamePageHeaderMode.of(scrollPx = 400, density = 0f)).isEqualTo(GamePageHeaderMode.Expanded)
    }

    @Test
    fun `le titre, le contenu et l emplacement trailing sont poses`() {
        compose.setContent {
            MeeshyTheme {
                GamePageScaffold(
                    title = "Titre",
                    onBack = {},
                    isRefreshing = false,
                    onRefresh = {},
                    trailing = { Row { Text("Droite") } },
                ) { Text("Corps") }
            }
        }

        compose.onAllNodesWithText("Titre").assertAnyExists()
        compose.onNodeWithText("Droite").assertExists()
        compose.onNodeWithText("Corps").assertExists()
    }

    @Test
    fun `une page sans relecture se compose aussi`() {
        compose.setContent {
            MeeshyTheme { GamePageScaffold(title = "Règles", onBack = {}, isRefreshing = false, onRefresh = null) { Text("Corps") } }
        }

        compose.onNodeWithText("Corps").assertExists()
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteractionCollection.assertAnyExists() {
        check(fetchSemanticsNodes().isNotEmpty()) { "Aucun nœud trouvé" }
    }
}
