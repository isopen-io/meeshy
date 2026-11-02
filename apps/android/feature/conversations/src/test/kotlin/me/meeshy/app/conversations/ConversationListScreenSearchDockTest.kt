package me.meeshy.app.conversations

import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationListScreenSearchDockTest {

    @get:Rule
    val compose = createComposeRule()

    private fun dock(
        visible: Boolean = true,
        focused: Boolean = false,
        query: String = "",
        communities: Int = 2,
    ) = compose.setContent {
        MeeshyTheme {
            ConversationSearchDock(
                visible = visible,
                isFocused = focused,
                query = query,
                communityCount = communities,
                syncPill = { Text("sync-pill") },
                communitiesBand = { Text("band") },
            ) { Text("bar") }
        }
    }

    @Test
    fun `la pastille de synchro s'amarre au-dessus de la barre`() {
        dock()

        compose.onNodeWithText("sync-pill").assertIsDisplayed()
        compose.onNodeWithText("bar").assertIsDisplayed()
    }

    @Test
    fun `la bande des communautes apparait au focus avec une requete vide`() {
        dock(focused = true)

        compose.onNodeWithTag(SEARCH_DOCK_BAND_TAG).assertIsDisplayed()
    }

    @Test
    fun `sans focus la bande est absente`() {
        dock(focused = false)

        compose.onNodeWithTag(SEARCH_DOCK_BAND_TAG).assertDoesNotExist()
    }

    @Test
    fun `une requete non vide replie la bande`() {
        dock(focused = true, query = "a")

        compose.onNodeWithTag(SEARCH_DOCK_BAND_TAG).assertDoesNotExist()
    }

    @Test
    fun `sans communaute la bande ne se peint pas`() {
        dock(focused = true, communities = 0)

        compose.onNodeWithTag(SEARCH_DOCK_BAND_TAG).assertDoesNotExist()
    }

    @Test
    fun `masque le pied de liste disparait`() {
        dock(visible = false)

        compose.onNodeWithText("bar").assertDoesNotExist()
    }
}
