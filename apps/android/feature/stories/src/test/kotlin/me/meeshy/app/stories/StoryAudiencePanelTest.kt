package me.meeshy.app.stories

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'audience du compositeur s'applique au toucher (#13838) : un mode touché s'applique et la feuille se ferme, sans bouton
 * « Appliquer » et sans phrase sur la portée de l'audience.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryAudiencePanelTest {

    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private class Calls {
        val chosen = mutableListOf<StoryVisibility>()
        var dismissed = 0
    }

    private fun show(): Calls {
        val calls = Calls()
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(360.dp, 692.dp)) {
                    StoryAudiencePanel(
                        visibility = StoryVisibility.PUBLIC,
                        userIds = emptyList(),
                        mentions = emptyList(),
                        hashtags = emptyList(),
                        onChooseVisibility = { calls.chosen += it },
                        onUserIdsChange = {},
                        onAddMention = {},
                        onRemoveMention = {},
                        onRemoveHashtag = {},
                        onDismiss = { calls.dismissed++ },
                    )
                }
            }
        }
        return calls
    }

    @Test
    fun `touching a mode applies it and closes the sheet`() {
        val calls = show()

        compose.onNodeWithContentDescription(string(R.string.stories_visibility_friends)).performClick()

        assertThat(calls.chosen).containsExactly(StoryVisibility.FRIENDS)
        assertThat(calls.dismissed).isEqualTo(1)
    }

    @Test
    fun `there is no apply button and no sentence about the audience's scope`() {
        show()

        compose.onNodeWithText(string(R.string.composer_audience_apply), substring = true).assertDoesNotExist()
        compose.onNodeWithText(string(R.string.composer_audience_scope)).assertDoesNotExist()
    }
}
