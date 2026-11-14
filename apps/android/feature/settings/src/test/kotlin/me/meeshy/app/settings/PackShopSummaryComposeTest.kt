package me.meeshy.app.settings

import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La boutique dit au repos ce que sont les Meeshes, au-dessus du solde (#17659, règle 7). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PackShopSummaryComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val orientation = "Meeshes buy packs: conversation backgrounds, avatar rings, banners."

    @Test
    fun `the orientation is read at rest above the balance`() {
        compose.setContent { MeeshyTheme { ShopSummary(balance = 40, failure = null) } }

        val sentence = compose.onNodeWithText(orientation).getUnclippedBoundsInRoot()
        val balance = compose.onNodeWithText("Meeshes: 40").getUnclippedBoundsInRoot()

        assertThat(sentence.top).isLessThan(balance.top)
    }

    @Test
    fun `the orientation stays when the balance is not known yet`() {
        compose.setContent { MeeshyTheme { ShopSummary(balance = null, failure = null) } }

        compose.onNodeWithText(orientation).assertExists()
        compose.onNodeWithText("Meeshes:", substring = true).assertDoesNotExist()
    }
}
