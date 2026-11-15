package me.meeshy.ui.component.focal

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalConversationStartRowTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la rangee nomme l'interlocuteur et le jour du premier message`() {
        compose.setContent { MeeshyTheme { FocalConversationStartRow("Mégane", firstMessageDayLabel = "Lundi 9 mai") } }
        compose.onNodeWithText("Start of the conversation with Mégane", substring = true, useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Lundi 9 mai", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `sans jour connu le nom seul`() {
        compose.setContent { MeeshyTheme { FocalConversationStartRow("Équipe") } }
        compose.onNodeWithText("Équipe", substring = true, useUnmergedTree = true).assertIsDisplayed()
        assertThat(compose.onAllNodes(androidx.compose.ui.test.hasText("Lundi"), useUnmergedTree = true).fetchSemanticsNodes()).isEmpty()
    }
}
