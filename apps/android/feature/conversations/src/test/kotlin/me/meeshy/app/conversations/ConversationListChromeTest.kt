package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Box
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
 * Elle est la première ligne de la liste dans tous les états (#13653, #13664).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationListChromeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la tete pose le rail en haut et les filtres SOUS lui, chacun une seule fois`() {
        compose.setContent {
            MeeshyTheme {
                ConversationListHead(
                    filters = { Box(Modifier.height(40.dp).testTag("filters")) { Text("filtres") } },
                    rail = { Box(Modifier.height(120.dp).testTag("rail")) { Text("rail") } },
                )
            }
        }

        compose.onAllNodesWithTag("rail").assertCountEquals(1)
        compose.onAllNodesWithTag("filters").assertCountEquals(1)
        val rail = compose.onNodeWithTag("rail").getUnclippedBoundsInRoot()
        val filters = compose.onNodeWithTag("filters").getUnclippedBoundsInRoot()
        assertThat(rail.top).isEqualTo(0.dp)
        assertThat(filters.top).isAtLeast(rail.bottom)
    }
}
