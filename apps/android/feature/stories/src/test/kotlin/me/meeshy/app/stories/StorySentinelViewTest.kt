package me.meeshy.app.stories

import android.content.Context
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.story.StorySentinelPolicy
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StorySentinelViewTest {
    @get:Rule
    val compose = createComposeRule()

    private fun text(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    @Test
    fun `la sentinelle dit la perte, rassure, puis offre les deux gestes`() {
        compose.setContent { StorySentinelView(onUpdate = {}, onSkip = {}) }
        compose.onNodeWithText(text(R.string.story_sentinel_title)).assertExists()
        compose.onNodeWithText(text(R.string.story_sentinel_body)).assertExists()
        compose.onNodeWithText(text(R.string.story_sentinel_update)).assertExists()
        compose.onNodeWithText(text(R.string.story_sentinel_skip)).assertExists()
    }

    @Test
    fun `mettre a jour et passer a la suivante appellent leurs gestes`() {
        val calls = mutableListOf<String>()
        compose.setContent { StorySentinelView(onUpdate = { calls += "update" }, onSkip = { calls += "skip" }) }
        compose.onNodeWithText(text(R.string.story_sentinel_update)).performClick()
        compose.onNodeWithText(text(R.string.story_sentinel_skip)).performClick()
        assertThat(calls).containsExactly("update", "skip").inOrder()
    }

    @Test
    fun `un kind reserve declenche la sentinelle`() {
        assertThat(StorySentinelPolicy.currentStoryIsUnpaintable(StoryEffects(unpaintableKinds = listOf("poll")))).isTrue()
    }
}
