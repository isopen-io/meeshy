package me.meeshy.ui.story.canvas

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextBackgroundStyle
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.SceneLists
import me.meeshy.sdk.model.scene.SceneReaderLanguages
import me.meeshy.sdk.model.scene.SceneRenderMode
import me.meeshy.sdk.model.scene.SceneRenderPlanner
import me.meeshy.sdk.model.scene.StoryTextFace
import me.meeshy.sdk.model.scene.StoryTextStyleCatalog
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneTextStyleRobolectricTest {
    @get:Rule
    val compose = createComposeRule()

    private fun plan(texts: List<StoryTextObject>) =
        SceneRenderPlanner.plan(SceneLists(texts = texts), 0.0, SceneRenderMode.PLAY, SceneReaderLanguages.NONE)

    @Test
    fun `every one of the eighteen styles resolves a font family`() {
        StoryTextStyleCatalog.all.forEach {
            val font = SceneTextFontResolver.resolve(it.wire, null)
            assertThat(font.weight).isEqualTo(FontWeight(it.fontWeight))
        }
        StoryTextFace.entries.forEach { assertThat(SceneTextFontResolver.familyOf(it)).isNotNull() }
    }

    @Test
    fun `the author weight overrides the style weight and an unknown style reads as bold`() {
        assertThat(SceneTextFontResolver.resolve("poster", "thin").weight).isEqualTo(FontWeight(200))
        assertThat(SceneTextFontResolver.resolve("hologram", null)).isEqualTo(SceneTextFontResolver.resolve("bold", null))
        assertThat(SceneTextFontResolver.resolve("italic", null).style).isEqualTo(FontStyle.Italic)
    }

    @Test
    fun `an eighteen-style text with outline effect and rtl content paints`() {
        val texts = StoryTextStyleCatalog.all.map { style ->
            StoryTextObject(
                id = style.wire, text = "مرحبا", textStyle = style.wire, fontWeight = "semibold",
                borderWidth = 4.0, borderColor = "FF0000", textEffect = "neonPink",
            )
        }
        compose.setContent { SceneCanvas(items = plan(texts)) }
        compose.onAllNodesWithTag(SCENE_TEXT_TAG).assertCountEquals(texts.size)
    }

    @Test
    fun `diamond cloud and speech frames paint without throwing`() {
        val texts = listOf("diamond", "cloud", "speech").map { shape ->
            StoryTextObject(
                id = shape, text = "Salut", frameShape = shape, frameBorderWidth = 3.0,
                backgroundStyle = StoryTextBackgroundStyle(type = "solid", hex = "112233"),
            )
        }
        compose.setContent { SceneCanvas(items = plan(texts)) }
        compose.onAllNodesWithTag(SCENE_TEXT_TAG).assertCountEquals(texts.size)
    }
}
