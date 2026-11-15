package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le compositeur peint un sticker à la taille que le lecteur lui donnera (loi 6, #14298) : 140 pixels de la scène de
 * référence, projetés sur la largeur réelle de la scène, fois son échelle — à toutes les échelles.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerStickerSizeParityTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `le cote d un sticker est 140 pixels de la scene de reference projetes sur la scene reelle`() {
        assertThat(StickerArtMetrics.sidePx(canvasWidthPx = 1080f)).isWithin(1e-4f).of(140f)
        assertThat(StickerArtMetrics.sidePx(canvasWidthPx = 540f)).isWithin(1e-4f).of(70f)
        assertThat(StickerArtMetrics.BASE_DESIGN_SIDE).isEqualTo(StoryStickerElement.BASE_DESIGN_SIDE)
    }

    private fun paintedWidths(scale: Float): Pair<Float, Float> {
        val element = StoryStickerElement(id = "c", emoji = "🔥", scale = scale)
        val published = StorySceneObjectsProjection.stickers(StoryEffects(stickerObjects = listOf(element.toSticker()))) { null }.single()
        compose.setContent {
            Box(Modifier.size(360.dp, 640.dp)) {
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    val widthPx = with(LocalDensity.current) { maxWidth.toPx() }
                    StickerLayer(
                        sticker = element, selected = false, menu = null,
                        canvasWidthPx = widthPx, canvasHeightPx = widthPx * 16f / 9f,
                        onTap = {}, onLongPress = {}, onMenuAction = {}, onMenuDismiss = {},
                        onDrag = { _, _ -> }, onDragEnd = {}, onTransform = { _, _ -> },
                    )
                }
            }
            Box(Modifier.size(360.dp, 640.dp)) { StoryStickerLayer(sticker = published, playheadSeconds = 0f) }
        }
        compose.waitForIdle()
        val composer = compose.onNodeWithTag(COMPOSER_STICKER_TAG).getBoundsInRoot()
        val reader = compose.onNodeWithTag(STORY_STICKER_TAG).getBoundsInRoot()
        return (composer.right - composer.left).value to (reader.right - reader.left).value
    }

    @Test
    fun `a l echelle 1 le compositeur et le lecteur peignent le meme carre`() {
        val (composer, reader) = paintedWidths(1f)
        assertThat(composer).isWithin(reader * 0.03f).of(reader)
    }

    @Test
    fun `agrandi 20 fois, le compositeur et le lecteur peignent le meme carre`() {
        val (composer, reader) = paintedWidths(20f)
        assertThat(composer).isWithin(reader * 0.03f).of(reader)
    }
}
