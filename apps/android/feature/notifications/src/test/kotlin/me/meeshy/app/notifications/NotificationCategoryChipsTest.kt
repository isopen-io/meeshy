package me.meeshy.app.notifications

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.NotificationFilterCategory
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w2400dp-h400dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationCategoryChipsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `les douze puces sont rendues et seule la choisie est selectionnee`() {
        compose.setContent { NotificationCategoryBar(selected = NotificationFilterCategory.MENTIONS, onSelect = {}) }

        compose.onAllNodes(isSelectable()).assertCountEquals(12)
        compose.onNodeWithText("Mentions").assertIsSelected()
        compose.onNodeWithText("All").assertIsNotSelected()
    }

    @Test
    fun `toucher une puce la remonte`() {
        val picked = mutableListOf<NotificationFilterCategory>()
        compose.setContent { NotificationCategoryBar(selected = NotificationFilterCategory.ALL, onSelect = { picked += it }) }

        compose.onNodeWithText("Calls").performClick()

        assertThat(picked).containsExactly(NotificationFilterCategory.CALLS)
    }
}
