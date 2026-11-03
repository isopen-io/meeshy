package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Un message supprimé est une capsule autonome alignée côté expéditeur (iOS `BubbleDeletedView`). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleDeletedViewRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(isOutgoing: Boolean) = compose.setContent {
        MeeshyTheme { BubbleDeletedView(isOutgoing = isOutgoing, onLongPress = null, modifier = Modifier.fillMaxWidth()) }
    }

    @Test
    fun `une capsule recue se range a gauche`() {
        show(isOutgoing = false)
        val rootWidth = compose.onRoot().getUnclippedBoundsInRoot().width
        val capsule = compose.onNodeWithContentDescription("Message deleted").getUnclippedBoundsInRoot()
        assertThat(capsule.left).isLessThan(rootWidth / 4)
    }

    @Test
    fun `une capsule envoyee se range a droite`() {
        show(isOutgoing = true)
        val rootWidth = compose.onRoot().getUnclippedBoundsInRoot().width
        val capsule = compose.onNodeWithContentDescription("Message deleted").getUnclippedBoundsInRoot()
        assertThat(capsule.right).isGreaterThan(rootWidth * 3 / 4)
    }
}
