package me.meeshy.app.notifications

import androidx.compose.ui.test.junit4.createComposeRule
import me.meeshy.sdk.model.NotificationFilterCategory
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13671 — comme iOS, la rangée de puces des Notifications prend toute la largeur : les disques flottent au-dessus (360 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationCategoryBarRestingDiscsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la rangee de puces prend toute la largeur sous les disques`() {
        compose.setContentBesideRestingDiscs { NotificationCategoryBar(selected = NotificationFilterCategory.ALL, onSelect = {}) }
        val (leftDisc, _) = compose.restingDiscBounds()
        val scroller = compose.scrollerBounds()
        assertThat(scroller.sharesHeightWith(leftDisc)).isTrue()
        assertThat(scroller.left.value).isEqualTo(0f)
        assertThat(scroller.right.value).isEqualTo(360f)
    }
}
