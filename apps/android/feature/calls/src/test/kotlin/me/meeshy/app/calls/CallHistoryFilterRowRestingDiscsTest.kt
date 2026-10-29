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

/** #13671 — comme iOS, les puces du journal des appels ne cèdent rien aux disques flottants : la rangée passe dessous (360 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallHistoryFilterRowRestingDiscsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `les puces et Tout effacer gardent leur place sous les disques`() {
        compose.setContentBesideRestingDiscs {
            CallHistoryFilterRow(missedOnly = false, videoOnly = false, canClear = true, onMissed = {}, onVideo = {}, onClearAll = {})
        }
        val (leftDisc, rightDisc) = compose.restingDiscBounds()
        val scroller = compose.scrollerBounds()
        val clear = compose.onNodeWithText("Tout effacer").getBoundsInRoot()
        assertThat(scroller.sharesHeightWith(leftDisc)).isTrue()
        assertThat(scroller.left.value).isLessThan(leftDisc.right.value)
        assertThat(clear.right.value).isGreaterThan(rightDisc.left.value)
    }
}
