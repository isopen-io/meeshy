package me.meeshy.app.settings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.RelationAudienceChoice
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** « Qui est prévenu » (#14064) : le défaut servi sans réglage, une famille qui se déplie, un cran choisi qui remonte. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CircleNotifySectionTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(initial: Map<String, RelationAudienceChoice> = emptyMap()): MutableList<Pair<String, RelationAudienceChoice>> {
        val chosen = mutableListOf<Pair<String, RelationAudienceChoice>>()
        compose.setContent {
            var state by mutableStateOf(initial)
            MeeshyTheme {
                CircleNotifySection(chosen = state) { key, choice ->
                    chosen += key to choice
                    state = state + (key to choice)
                }
            }
        }
        compose.waitForIdle()
        return chosen
    }

    @Test
    fun `without any setting the three families show the served defaults, Close, Close, Blood`() {
        show()

        compose.onNodeWithText("My publications").assertIsDisplayed()
        assertThat(compose.onAllNodesWithText("Close").fetchSemanticsNodes()).hasSize(2)
        assertThat(compose.onAllNodesWithText("Blood").fetchSemanticsNodes()).hasSize(1)
    }

    @Test
    fun `a family opens on its actions, and a choice goes up with the action's flat key`() {
        val chosen = show()

        compose.onNodeWithText("My activity elsewhere").performClick()
        compose.onNodeWithText("Comment").performClick()
        compose.onNodeWithText("Nobody").performClick()
        compose.waitForIdle()

        assertThat(chosen).containsExactly("circleElsewhereComment" to RelationAudienceChoice.NOBODY)
        compose.onNodeWithText("No one around you is notified.").assertIsDisplayed()
    }

    @Test
    fun `a family whose actions differ says so`() {
        show(mapOf("circlePublicationReel" to RelationAudienceChoice.PUBLIC))

        compose.onNodeWithText("Depends on the action").assertIsDisplayed()
    }

    @Test
    fun `public says in plain words that no stranger is notified`() {
        show(mapOf("circlePublicationPost" to RelationAudienceChoice.PUBLIC))

        compose.onNodeWithText("My publications").performClick()

        compose.onNodeWithText(PUBLIC_EXPLANATION, substring = true).assertIsDisplayed()
    }

    private companion object {
        const val PUBLIC_EXPLANATION = "no stranger is notified"
    }
}
