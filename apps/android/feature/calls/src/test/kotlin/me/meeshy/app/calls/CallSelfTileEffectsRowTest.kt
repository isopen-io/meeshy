package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallSelfTileLaw
import me.meeshy.sdk.model.call.CallSelfTileMemory
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #17327 — ma vignette ne porte aucune commande autour d'elle : au repos elle ne laisse plus la place d'une rangée sous
 * l'en-tête ni au-dessus de la pilule (les commandes de mon image sont le rail du début du (…), P1.2 · P2.10).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallSelfTileEffectsRowTest {
    @get:Rule val rule = createComposeRule()

    @Test
    @Config(qualifiers = "w360dp-h800dp")
    fun `my tile rests against the clearance of the chrome, with no room kept for a row around it`() {
        rule.setContent {
            MeeshyTheme {
                CallSelfTile(
                    callKey = "call-1",
                    memory = CallSelfTileMemory(),
                    paused = false,
                    reduceMotion = true,
                    onSwap = {},
                    modifier = Modifier.fillMaxSize(),
                ) { Box(Modifier.fillMaxSize().testTag("tile")) }
            }
        }
        val tile = rule.onNodeWithTag("tile", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertThat(tile.top).isWithin(1f).of(CallSelfTileLaw.TOP_CLEARANCE_DP)
    }
}
