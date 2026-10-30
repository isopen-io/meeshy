package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StorySticker
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en")
class StoryStickerTemplateViewerTest {

    @get:Rule
    val compose = createComposeRule()

    private val neon = StorySticker(id = "s1", emoji = "💡", templateId = "text.neon", slots = mapOf("text" to "Salut"))

    @Test
    fun `la projection du lecteur garde le gabarit et ses mots`() {
        val view = StorySceneObjectsProjection.stickers(StoryEffects(stickerObjects = listOf(neon))) { null }.single()
        assertThat(view.templateId).isEqualTo("text.neon")
        assertThat(view.slots).containsExactly("text", "Salut")
    }

    @Test
    fun `le lecteur dessine le cadre a mots, pas son emoji de repli`() {
        val view = StorySceneObjectsProjection.stickers(StoryEffects(stickerObjects = listOf(neon))) { null }.single()
        compose.setContent { MeeshyTheme { Box(Modifier.size(390.dp, 690.dp)) { StoryStickerLayer(view, playheadSeconds = 0f) } } }
        compose.onNodeWithText("Salut").assertIsDisplayed()
        assertThat(compose.onAllNodesWithText("💡").fetchSemanticsNodes()).isEmpty()
    }

    @Test
    fun `un gabarit que ce binaire ne dessine pas retombe sur son emoji`() {
        val weather = StorySticker(id = "s2", emoji = "☀️", templateId = "weather.sun")
        val view = StorySceneObjectsProjection.stickers(StoryEffects(stickerObjects = listOf(weather))) { null }.single()
        compose.setContent { MeeshyTheme { Box(Modifier.size(390.dp, 690.dp)) { StoryStickerLayer(view, playheadSeconds = 0f) } } }
        compose.onNodeWithText("☀️").assertIsDisplayed()
    }
}
