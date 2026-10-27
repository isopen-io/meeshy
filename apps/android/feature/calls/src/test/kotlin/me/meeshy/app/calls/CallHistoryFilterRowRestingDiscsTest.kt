package me.meeshy.app.calls

import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #12497 — au repos, les puces du journal des appels et « Tout effacer » restent entre les deux disques flottants (360 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallHistoryFilterRowRestingDiscsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `au repos les puces et Tout effacer tiennent entre les deux disques`() {
        compose.setContentBesideRestingDiscs {
            CallHistoryFilterRow(missedOnly = false, videoOnly = false, canClear = true, onMissed = {}, onVideo = {}, onClearAll = {})
        }
        val scroller = compose.scrollerBounds()
        val clear = compose.onNodeWithText("Tout effacer").getBoundsInRoot()
        assertThat(scroller.left.value).isAtLeast(RestingDiscs.leadingEdge)
        assertThat(clear.right.value).isAtMost(RestingDiscs.trailingEdge)
    }
}
