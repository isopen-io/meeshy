package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La tête de la liste des conversations suit iOS (`ConversationListView`) : le rail de stories d'abord, les filtres
 * SOUS lui (#4069). Le rail se pose donc juste sous l'en-tête, dans la bande que les disques flottants laissent libre
 * au-dessus de leur zone de parcage — posé sous les filtres, son bas passait sous le disque de gauche (#13665).
 * Peuplée, la tête est la première ligne de la liste ; hors liste peuplée, elle se pose au même endroit (#13653).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationListChromeTest {

    @get:Rule
    val compose = createComposeRule()

    private fun chrome(railInList: Boolean) = compose.setContent {
        MeeshyTheme {
            ConversationListChrome(
                railInList = railInList,
                filters = { Box(Modifier.height(40.dp).testTag("filters")) { Text("filtres") } },
                rail = { Box(Modifier.height(120.dp).testTag("rail")) { Text("rail") } },
            ) { head ->
                Box(Modifier.height(400.dp).testTag("content")) {
                    if (railInList) Column { head() }
                }
            }
        }
    }

    @Test
    fun `hors liste peuplee le rail se pose en tete, les filtres sous lui, le contenu ensuite`() {
        chrome(railInList = false)

        val rail = compose.onNodeWithTag("rail").getUnclippedBoundsInRoot()
        val filters = compose.onNodeWithTag("filters").getUnclippedBoundsInRoot()
        val content = compose.onNodeWithTag("content").getUnclippedBoundsInRoot()
        assertThat(rail.top).isEqualTo(0.dp)
        assertThat(filters.top).isAtLeast(rail.bottom)
        assertThat(content.top).isAtLeast(filters.bottom)
    }

    @Test
    fun `liste peuplee la tete est rendue une fois, dans la liste, le rail au-dessus des filtres`() {
        chrome(railInList = true)

        compose.onAllNodesWithTag("rail").assertCountEquals(1)
        compose.onAllNodesWithTag("filters").assertCountEquals(1)
        val rail = compose.onNodeWithTag("rail").getUnclippedBoundsInRoot()
        val filters = compose.onNodeWithTag("filters").getUnclippedBoundsInRoot()
        assertThat(rail.top).isEqualTo(0.dp)
        assertThat(filters.top).isAtLeast(rail.bottom)
    }
}
