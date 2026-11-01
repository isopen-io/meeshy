package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le lecteur rend l'échelle qu'écrit le compositeur, sans plafond ni plancher (#14298) : un sticker agrandi 100 fois
 * se peint 100 fois plus grand, un sticker réduit à 5 pixels de la scène de référence se peint à 5 pixels de la scène.
 * Aucun lecteur ne re-borne — la carte, la fiche et l'export passent par ces mêmes calques.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryReaderObjectScaleTest {
    @get:Rule
    val compose = createComposeRule()

    private fun sticker(scale: Double): StoryStickerView = StorySceneObjectsProjection.stickers(
        StoryEffects(stickerObjects = listOf(StorySticker(id = "s", emoji = "🔥", x = 0.5, y = 0.5, scale = scale, baseSize = 140.0))),
    ) { null }.single()

    private fun text(scale: Double): StoryTextObjectView =
        StoryTextObjectProjection.project(StoryTextObject(id = "t", text = "Bonjour", scale = scale, fontSize = 64.0), preferredLanguages = emptyList())

    @Test
    fun `le cote d un sticker suit son echelle au dela de quatre et en deca de l ancien plancher`() {
        assertThat(sticker(100.0).sideFraction).isWithin(1e-9).of(140.0 * 100.0 / 1080.0)
        assertThat(sticker(5.0 / 140.0).sideFraction).isWithin(1e-12).of(5.0 / 1080.0)
        val big = sticker(100.0).drawnSide
        assertThat(big.layout * big.layer).isWithin(1e-9).of(140.0 * 100.0 / 1080.0)
    }

    @Test
    fun `un texte et un media ecrits a 40 se rendent a 40, la mise en page s arretant a 4`() {
        val t = text(40.0)
        assertThat(t.scale).isEqualTo(40.0)
        assertThat(t.layered.layout * t.layered.layer).isWithin(1e-9).of(40.0)
        assertThat(t.fontPx(1080f)).isWithin(0.01f).of(64f * 4f)
        val m = StoryForegroundMediaView(id = "m", url = "u", isVideo = false, x = 0.5, y = 0.5, scale = 40.0, aspectRatio = 1.0).bounded()
        assertThat(m.scale).isEqualTo(40.0)
        assertThat(m.animated(0f).scale).isEqualTo(40.0)
        assertThat(m.layered.layout).isEqualTo(4.0)
        assertThat(m.layered.layer).isEqualTo(10.0)
    }

    @Test
    fun `un media pose se peint a l export a son echelle entiere`() {
        val m = StoryForegroundMediaView(id = "m", url = "u", isVideo = true, x = 0.5, y = 0.5, scale = 12.0, aspectRatio = 1.0)
        val placement = StoryExportPlacedVideos.placement(m, 0f, StoryExportVideoFormat.of())!!
        val expected = ForegroundMediaFrame.renderedSize(1.0, 12.0, StoryExportVideoFormat.of().width.toDouble())
        assertThat(placement.width.toDouble()).isWithin(0.01).of(expected.width)
    }

    private fun paintedWidths(vararg stickers: StoryStickerView): List<Float> {
        compose.setContent {
            stickers.forEach { sticker ->
                Box(Modifier.size(360.dp, 640.dp)) { StoryStickerLayer(sticker = sticker, playheadSeconds = 0f) }
            }
        }
        compose.waitForIdle()
        val nodes = compose.onAllNodesWithTag(STORY_STICKER_TAG)
        return stickers.indices.map { i -> nodes[i].getBoundsInRoot().let { (it.right - it.left).value } }
    }

    @Test
    fun `le lecteur peint un sticker plus grand que la scene a sa taille, sans le ramener a la largeur de la scene`() {
        val (unit, big) = paintedWidths(sticker(1.0), sticker(20.0))
        assertThat(big / unit).isWithin(0.5f).of(20f)
    }

    @Test
    fun `le lecteur peint un sticker agrandi 100 fois cent fois plus grand, par son calque au-dela de quatre largeurs`() {
        val (unit, big) = paintedWidths(sticker(1.0), sticker(100.0))
        assertThat(sticker(100.0).drawnSide.layout).isEqualTo(4.0)
        assertThat(big / unit).isWithin(2f).of(100f)
    }

    @Test
    fun `le lecteur peint un sticker reduit a 5 pixels de la scene sous l ancien plancher de 8 dp`() {
        val (unit, tiny) = paintedWidths(sticker(1.0), sticker(5.0 / 140.0))
        assertThat(unit).isGreaterThan(8f)
        assertThat(tiny).isGreaterThan(0f)
        assertThat(tiny).isLessThan(4f)
    }

    @Test
    fun `le lecteur peint un texte et un media ecrits a 1000 sans lever`() {
        val media = StoryForegroundMediaView(id = "m", url = "u", isVideo = false, x = 0.5, y = 0.5, scale = 1000.0, aspectRatio = 1.0)
        compose.setContent {
            Box(Modifier.size(360.dp, 640.dp)) {
                StoryTextObjectLayer(textObject = text(1000.0), playheadSeconds = 0f)
                StoryForegroundLayer(media = media, playheadSeconds = 0f, playing = false, muted = true, players = false)
            }
        }
        compose.waitForIdle()
        compose.onNodeWithText("Bonjour").assertExists()
    }

}
