package me.meeshy.app.conversations

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CategoryOption
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SectionCollapseSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val work = CategoryOption(id = "work", name = "Work")

    private fun rowCount() = compose.onAllNodesWithTag(ROW_TEST_TAG).fetchSemanticsNodes().size

    @Test
    fun `replier une section retire ses lignes et deplier les restitue`() {
        val conversations = listBodyConversations(4, categoryOf = { if (it <= 2) "work" else null })
        compose.setListBody(conversations, categories = listOf(work.copy(isExpanded = true)))
        compose.waitForIdle()
        assertThat(rowCount()).isEqualTo(4)

        compose.onNodeWithText("WORK").performClick()
        compose.waitForIdle()
        assertThat(rowCount()).isEqualTo(2)

        compose.onNodeWithText("WORK").performClick()
        compose.waitForIdle()
        assertThat(rowCount()).isEqualTo(4)
    }

    @Test
    fun `une section repliee par defaut n'a aucune ligne composee`() {
        val conversations = listBodyConversations(4, categoryOf = { if (it <= 2) "work" else null })
        compose.setListBody(conversations, categories = listOf(work.copy(isExpanded = false)))
        compose.waitForIdle()

        assertThat(rowCount()).isEqualTo(2)
    }
}
