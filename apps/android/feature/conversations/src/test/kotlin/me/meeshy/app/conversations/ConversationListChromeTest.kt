package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.assertCountEquals
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
 * #13653 — le rail de stories garde SA place quel que soit l'état de la liste. Peuplée, il est la première ligne
 * de la liste (il défile avec elle) ; squelette, erreur, filtre ou recherche sans résultat, il se pose au même
 * endroit — sous les filtres épinglés. Il se posait au-dessus d'eux : taper un filtre qui vide la liste, ou une
 * recherche qui ne trouve rien, faisait sauter la rangée de filtres de toute la hauteur du rail sous le doigt.
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
            ) {
                Box(Modifier.height(200.dp).testTag("content")) {
                    if (railInList) Box(Modifier.height(120.dp).testTag("rail")) { Text("rail") }
                }
            }
        }
    }

    @Test
    fun `hors liste peuplee le rail se pose sous les filtres, a la place qu il occupe dans la liste`() {
        chrome(railInList = false)

        val filters = compose.onNodeWithTag("filters").getUnclippedBoundsInRoot()
        val rail = compose.onNodeWithTag("rail").getUnclippedBoundsInRoot()
        val content = compose.onNodeWithTag("content").getUnclippedBoundsInRoot()
        assertThat(filters.top).isEqualTo(0.dp)
        assertThat(rail.top).isAtLeast(filters.bottom)
        assertThat(content.top).isAtLeast(rail.bottom)
    }

    @Test
    fun `liste peuplee les filtres restent en tete et le rail n est rendu qu une fois, dans la liste`() {
        chrome(railInList = true)

        compose.onAllNodesWithTag("rail").assertCountEquals(1)
        val filters = compose.onNodeWithTag("filters").getUnclippedBoundsInRoot()
        val rail = compose.onNodeWithTag("rail").getUnclippedBoundsInRoot()
        assertThat(filters.top).isEqualTo(0.dp)
        assertThat(rail.top).isAtLeast(filters.bottom)
    }
}
