package me.meeshy.app.chat.river

import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import java.util.Locale
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.StickerBoxLaw
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #14534 — dans la Rivière, un sticker se dessine dans le couloir de sa voix, sans la carte grise du texte. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RiverStickerRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private val title = MeeStickerCatalog.stickerById("mee-coucou")!!.title

    private fun content(): RiverBubbleContent {
        val bubble = riverBubble(
            "s1", "alice", 0, text = "",
            sticker = BubbleStickerSpec(MessageSticker(templateId = "mee.mee-coucou"), null),
        )
        return RiverRenderingBuilder.build(
            geometry = RiverThreadMapping.geometry(listOf(bubble)),
            bubbles = listOf(bubble),
            storyRing = { StoryRingState.None },
            zone = ZoneOffset.UTC,
            locale = Locale.FRANCE,
        ).contents.single()
    }

    private fun show(width: Int) = compose.setContent {
        MeeshyTheme { RiverBubble(content = content(), contentWidth = width.dp, actions = RiverBubbleActions()) }
    }

    @Test
    fun `le film se dessine a son cote de rangee, marge comprise, dans un couloir large`() {
        show(width = 320)
        val bounds = compose.onNodeWithContentDescription(title, useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertThat((bounds.right - bounds.left).value)
            .isWithin(0.5f).of(StickerBoxLaw.filmFootprint(FocalMetrics.Sticker.SIDE.toFloat()))
    }

    @Test
    fun `un couloir etroit reduit le film sans que sa marge depasse le couloir`() {
        show(width = 120)
        val bounds = compose.onNodeWithContentDescription(title, useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertThat((bounds.right - bounds.left).value).isAtMost(120.5f)
    }
}
