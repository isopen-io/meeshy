package me.meeshy.app.notifications

import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import me.meeshy.sdk.model.NotificationFilterCategory
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #12497 — « Toutes », première puce des Notifications, ne reste pas sous le disque flottant au repos (360 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationCategoryBarRestingDiscsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `au repos la rangee de puces tient entre les deux disques`() {
        compose.setContentBesideRestingDiscs { NotificationCategoryBar(selected = NotificationFilterCategory.ALL, onSelect = {}) }
        val scroller = compose.scrollerBounds()
        assertThat(scroller.left.value).isAtLeast(RestingDiscs.leadingEdge)
        assertThat(scroller.right.value).isAtMost(RestingDiscs.trailingEdge)
    }
}
