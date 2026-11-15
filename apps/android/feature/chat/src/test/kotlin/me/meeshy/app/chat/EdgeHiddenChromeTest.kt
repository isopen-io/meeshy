package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EdgeHiddenChromeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `l'en-tete glisse de 28 dp vers le haut et la barre vers le bas`() {
        assertThat(EdgeHiddenChrome.offsetDp(isHidden = true, edge = ChromeEdge.Top)).isEqualTo(-28f)
        assertThat(EdgeHiddenChrome.offsetDp(isHidden = true, edge = ChromeEdge.Bottom)).isEqualTo(28f)
        assertThat(EdgeHiddenChrome.offsetDp(isHidden = false, edge = ChromeEdge.Top)).isEqualTo(0f)
    }

    @Test
    fun `masque il se fond completement et revient plein`() {
        assertThat(EdgeHiddenChrome.opacity(isHidden = true)).isEqualTo(0f)
        assertThat(EdgeHiddenChrome.opacity(isHidden = false)).isEqualTo(1f)
        assertThat(EdgeHiddenChrome.DURATION_MS).isEqualTo(250)
    }

    @Test
    fun `les touches sont coupees tant que le chrome est masque puis reviennent`() {
        var hidden by mutableStateOf(true)
        var clicks = 0
        compose.setContent {
            Box(Modifier.hiddenTowardsEdge(hidden, ChromeEdge.Top)) {
                Text("bouton", Modifier.testTag("b").size(48.dp).clickable { clicks += 1 })
            }
        }
        compose.waitForIdle()
        compose.onNodeWithTag("b").performClick()
        assertThat(clicks).isEqualTo(0)

        hidden = false
        compose.waitForIdle()
        compose.onNodeWithTag("b").performClick()
        assertThat(clicks).isEqualTo(1)
    }
}
