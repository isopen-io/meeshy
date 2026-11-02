package me.meeshy.ui.component.bubble

import android.graphics.Paint
import android.graphics.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.StickerBoxLaw
import me.meeshy.ui.sticker.MessageStickerArtwork
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14534 — un emoji en grand ne se coupe ni en haut ni en bas : la boîte mesurée de son texte contient l'encre de son
 * glyphe (🥳, 🤯 ont les plus grands débordements), dans la bulle, la rangée plate et l'emoji-sticker.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LargeEmojiUnclippedRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private fun inkHeightPx(glyph: String, fontPx: Float): Int {
        val bounds = Rect()
        Paint().apply { textSize = fontPx }.getTextBounds(glyph, 0, glyph.length, bounds)
        return bounds.height()
    }

    private fun assertHolds(glyph: String, fontSp: Float) {
        val density = compose.density
        val box: Dp = compose.onNodeWithText(glyph, useUnmergedTree = true).getUnclippedBoundsInRoot().let { it.bottom - it.top }
        val boxPx = with(density) { box.toPx() }
        val fontPx = with(density) { fontSp * fontScale * this.density }
        assertThat(boxPx).isAtLeast(inkHeightPx(glyph, fontPx).toFloat())
        assertThat(boxPx).isAtLeast(fontPx)
    }

    private fun emojiContent(glyph: String) = BubbleContent(
        messageId = "m1",
        text = glyph,
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = "Ada",
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = "2026-11-02T10:00:00Z",
        emojiOnlyCount = 1,
        isFirstInGroup = true,
    )

    @Test
    fun `l emoji-sticker garde tout son glyphe`() {
        compose.setContent { MeeshyTheme { MessageStickerArtwork(BubbleStickerSpec(MessageSticker(emoji = "🥳"), null)) } }
        assertHolds("🥳", StickerBoxLaw.EMOJI_GLYPH_DP)
    }

    @Test
    fun `l emoji libre de la bulle garde tout son glyphe`() {
        compose.setContent { MeeshyTheme { MessageBubble(content = emojiContent("🤯")) } }
        assertHolds("🤯", EmojiDetector.fontSizeSp(1)!!.toFloat())
    }

    @Test
    fun `l emoji seul de la rangee plate garde tout son glyphe`() {
        compose.setContent { MeeshyTheme { FocalFlatRow(content = emojiContent("🥳"), accentColor = Color.Blue) } }
        assertHolds("🥳", EmojiDetector.fontSizeSp(1)!!.toFloat())
    }
}
