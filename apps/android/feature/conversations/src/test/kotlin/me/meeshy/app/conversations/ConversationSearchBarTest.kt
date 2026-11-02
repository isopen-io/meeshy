package me.meeshy.app.conversations

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
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
class ConversationSearchBarTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la croix d'effacement n'existe que pour un texte non vide`() {
        compose.setContent { MeeshyTheme { ConversationSearchBar(query = "", onQueryChange = {}) } }

        compose.onNodeWithContentDescription("Clear search").assertDoesNotExist()
    }

    @Test
    fun `la croix efface la requete`() {
        var query by mutableStateOf("abc")
        compose.setContent { MeeshyTheme { ConversationSearchBar(query = query, onQueryChange = { query = it }) } }

        compose.onNodeWithContentDescription("Clear search").performClick()

        assertThat(query).isEmpty()
    }

    @Test
    fun `la saisie remonte le texte`() {
        var query by mutableStateOf("")
        compose.setContent { MeeshyTheme { ConversationSearchBar(query = query, onQueryChange = { query = it }) } }

        compose.onNodeWithText("Search conversations").performTextInput("hello")

        assertThat(query).isEqualTo("hello")
    }

    @Test
    fun `la loupe bascule le focus`() {
        var toggles = 0
        compose.setContent {
            MeeshyTheme { ConversationSearchBar(query = "", onQueryChange = {}, onToggleFocus = { toggles++ }) }
        }

        compose.onNodeWithContentDescription("Search", substring = true).performClick()

        assertThat(toggles).isEqualTo(1)
    }

    @Test
    fun `les boutons tableau de bord et recherche globale sont conserves`() {
        var dashboard = 0
        var global = 0
        compose.setContent {
            MeeshyTheme {
                ConversationSearchBar(
                    query = "",
                    onQueryChange = {},
                    onDashboard = { dashboard++ },
                    onGlobalSearch = { global++ },
                )
            }
        }

        compose.onNodeWithContentDescription("Dashboard").assertIsDisplayed().performClick()
        compose.onNodeWithContentDescription("Global search").assertIsDisplayed().performClick()

        assertThat(dashboard).isEqualTo(1)
        assertThat(global).isEqualTo(1)
    }
}
