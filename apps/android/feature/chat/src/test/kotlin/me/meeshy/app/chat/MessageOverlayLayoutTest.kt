package me.meeshy.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Behavioural port of the iOS `MessageOverlayMenu` native-lean geometry.
 * Exercises [MessageOverlayLayout.compute] through its public result: the
 * uniform preview scale (full / height-capped / floored / squeezed-to-fit), the
 * leading/trailing horizontal anchor, the safe-area vertical clamp, and the
 * independent emoji/menu X clamps. No implementation detail is asserted — only
 * the observable cluster geometry.
 */
class MessageOverlayLayoutTest {

    private val eps = 0.01f

    // A roomy screen so nothing squeezes unless a test forces it.
    private fun cluster(
        bubble: OverlayRect,
        screenWidth: Float = 400f,
        screenHeight: Float = 900f,
        safeTop: Float = 48f,
        safeBottom: Float = 34f,
        menuWidth: Float = 220f,
        menuHeight: Float = 260f,
        isOutgoing: Boolean = true,
    ): MessageOverlayCluster = MessageOverlayLayout.compute(
        bubble = bubble,
        screenWidth = screenWidth,
        screenHeight = screenHeight,
        safeTop = safeTop,
        safeBottom = safeBottom,
        menuWidth = menuWidth,
        menuHeight = menuHeight,
        isOutgoing = isOutgoing,
    )

    // region scale — full size when it fits

    @Test
    fun shortBubble_thatFits_rendersAtFullScale() {
        val c = cluster(OverlayRect(left = 60f, top = 400f, width = 200f, height = 120f))
        assertEquals(1.0f, c.scale, eps)
        assertEquals(200f, c.preview.width, eps)
        assertEquals(120f, c.preview.height, eps)
    }

    @Test
    fun bubbleExactlyAtMaxHeight_isNotScaled() {
        // height == MAX_PREVIEW_HEIGHT is the inclusive "still full size" boundary.
        val c = cluster(
            OverlayRect(left = 60f, top = 40f, width = 200f, height = 320f),
            screenHeight = 1600f,
            safeTop = 0f,
            safeBottom = 0f,
        )
        assertEquals(1.0f, c.scale, eps)
    }

    // region scale — height cap

    @Test
    fun tallBubble_isCappedProportionallyToMaxHeight() {
        // 320 / 400 = 0.8; a very tall screen keeps the fit branch inert.
        val c = cluster(
            OverlayRect(left = 60f, top = 40f, width = 300f, height = 400f),
            screenHeight = 2000f,
            safeTop = 0f,
            safeBottom = 0f,
        )
        assertEquals(0.8f, c.scale, eps)
        assertEquals(320f, c.preview.height, eps)
        assertEquals(240f, c.preview.width, eps)
    }

    @Test
    fun veryTallBubble_scaleIsFlooredForLegibility() {
        // 320 / 1000 = 0.32 < 0.55 floor.
        val c = cluster(
            OverlayRect(left = 60f, top = 40f, width = 200f, height = 1000f),
            screenHeight = 4000f,
            safeTop = 0f,
            safeBottom = 0f,
        )
        assertEquals(MessageOverlayLayout.PREVIEW_SCALE_FLOOR, c.scale, eps)
    }

    // region scale — squeeze to fit the safe band

    @Test
    fun clusterTallerThanBand_squeezesBelowThePreviewScale() {
        // Tall bubble (height cap gives preview scale 0.8) on a short screen where
        // the scaled bubble + chrome overflow the available band -> the fit scale
        // shrinks it below the height-cap scale.
        // available = (600-24-12) - (24+12) = 528 ; chrome = 52 + 24 + 200 = 276
        // scaledBubbleHeight = 400 * 0.8 = 320 ; 320 + 276 = 596 > 528 -> squeeze
        // fit = min(0.8, max(60, 528-276)/400) = min(0.8, 252/400=0.63) = 0.63
        val c = cluster(
            OverlayRect(left = 60f, top = 300f, width = 200f, height = 400f),
            screenHeight = 600f,
            safeTop = 24f,
            safeBottom = 24f,
            menuHeight = 200f,
        )
        assertTrue("fit scale must drop below the height-cap scale", c.scale < 0.8f)
        assertEquals(0.63f, c.scale, eps)
    }

    @Test
    fun clusterFarTallerThanBand_squeezeIsFloored() {
        val c = cluster(
            OverlayRect(left = 10f, top = 100f, width = 120f, height = 2000f),
            screenHeight = 500f,
            safeTop = 20f,
            safeBottom = 20f,
            menuHeight = 300f,
        )
        assertEquals(MessageOverlayLayout.FIT_SCALE_FLOOR, c.scale, eps)
    }

    // region horizontal anchor

    // A tall bubble (scaled to 0.55) makes the preview narrower than its source,
    // so a trailing anchor (right - w/2) and a leading anchor (left + w/2) land at
    // genuinely different X — the only regime in which the direction is testable.
    private fun scaledBubble(left: Float) = OverlayRect(left = left, top = 400f, width = 200f, height = 1000f)

    @Test
    fun outgoingBubble_anchorsHeroToTrailingEdge() {
        val bubble = scaledBubble(left = 100f)
        val c = cluster(bubble, screenHeight = 4000f, safeTop = 0f, safeBottom = 0f, isOutgoing = true)
        assertTrue("preview must be narrower than source to test the anchor", c.preview.width < bubble.width)
        assertEquals(bubble.right - c.preview.width / 2f, c.preview.centerX, eps)
        // A trailing anchor is strictly right of where a leading anchor would sit.
        assertTrue(c.preview.centerX > bubble.left + c.preview.width / 2f + eps)
    }

    @Test
    fun incomingBubble_anchorsHeroToLeadingEdge() {
        val bubble = scaledBubble(left = 20f)
        val c = cluster(bubble, screenHeight = 4000f, safeTop = 0f, safeBottom = 0f, isOutgoing = false)
        assertEquals(bubble.left + c.preview.width / 2f, c.preview.centerX, eps)
        assertTrue(c.preview.centerX < bubble.right - c.preview.width / 2f - eps)
    }

    // region vertical stacking

    @Test
    fun clusterStacksEmojiThenBubbleThenMenuWithGaps() {
        val c = cluster(OverlayRect(left = 60f, top = 400f, width = 200f, height = 120f))
        val bubbleTop = c.preview.top
        // emoji bar sits one bar-height above the bubble top, minus the gap.
        assertEquals(bubbleTop - MessageOverlayLayout.GAP - MessageOverlayLayout.EMOJI_BAR_HEIGHT / 2f, c.emojiBar.y, eps)
        // menu sits one gap below the bubble bottom, centered on its own height.
        val menuHeight = 260f
        assertEquals(c.preview.bottom + MessageOverlayLayout.GAP + menuHeight / 2f, c.actionMenu.y, eps)
        // preview center is midway down its own rect.
        assertEquals(bubbleTop + c.preview.height / 2f, c.preview.centerY, eps)
    }

    @Test
    fun desiredTopAboveSafeArea_clampsClusterDownToInset() {
        // Bubble hugging the very top; desired top would be negative -> clamp to availTop.
        val c = cluster(
            OverlayRect(left = 60f, top = 4f, width = 200f, height = 120f),
            safeTop = 48f,
        )
        // availTop = safeTop + 12 = 60; emoji bar center = availTop + 26 = 86
        assertEquals(60f + MessageOverlayLayout.EMOJI_BAR_HEIGHT / 2f, c.emojiBar.y, eps)
    }

    @Test
    fun bubbleNearBottom_clampsClusterUpToFit() {
        val screenHeight = 900f
        val safeBottom = 34f
        val menuHeight = 260f
        val bubble = OverlayRect(left = 60f, top = 820f, width = 200f, height = 120f)
        val c = cluster(bubble, screenHeight = screenHeight, safeBottom = safeBottom, menuHeight = menuHeight)
        val availBottom = screenHeight - safeBottom - 12f
        // bottom of the menu never crosses availBottom.
        assertTrue(c.actionMenu.y + menuHeight / 2f <= availBottom + eps)
    }

    // region horizontal clamps

    @Test
    fun outgoingBubbleAtRightEdge_clampsMenuInsideScreen() {
        val screenWidth = 400f
        val menuWidth = 220f
        val bubble = OverlayRect(left = 360f, top = 400f, width = 30f, height = 60f)
        val c = cluster(bubble, screenWidth = screenWidth, menuWidth = menuWidth, isOutgoing = true)
        val maxMenuX = screenWidth - MessageOverlayLayout.SIDE_PADDING - menuWidth / 2f
        assertEquals(maxMenuX, c.actionMenu.x, eps)
    }

    @Test
    fun incomingBubbleAtLeftEdge_clampsMenuInsideScreen() {
        val menuWidth = 220f
        val bubble = OverlayRect(left = 2f, top = 400f, width = 30f, height = 60f)
        val c = cluster(bubble, menuWidth = menuWidth, isOutgoing = false)
        val minMenuX = MessageOverlayLayout.SIDE_PADDING + menuWidth / 2f
        assertEquals(minMenuX, c.actionMenu.x, eps)
    }

    @Test
    fun emojiBar_clampsIndependentlyFromMenuUsingItsOwnWidth() {
        // The wide emoji bar clamps at a different X than the narrower menu even for
        // the same anchor — proving the two X clamps are computed separately.
        val screenWidth = 400f
        val menuWidth = 180f
        val bubble = OverlayRect(left = 360f, top = 400f, width = 30f, height = 60f)
        val c = cluster(bubble, screenWidth = screenWidth, menuWidth = menuWidth, isOutgoing = true)
        val maxEmojiX = screenWidth - MessageOverlayLayout.SIDE_PADDING - MessageOverlayLayout.EMOJI_BAR_WIDTH / 2f
        val maxMenuX = screenWidth - MessageOverlayLayout.SIDE_PADDING - menuWidth / 2f
        assertEquals(maxEmojiX, c.emojiBar.x, eps)
        assertTrue("wide emoji bar clamps further inward than the menu", c.emojiBar.x < c.actionMenu.x)
    }

    @Test
    fun previewHero_isNotHorizontallyClampedLikeTheMenu() {
        // Outgoing bubble at the far right: the menu clamps inward, but the preview
        // hero stays anchored to the bubble's own trailing edge (sits outside the
        // menu's clamp band). Tall so the preview is scaled and the anchor is
        // directional rather than the symmetric full-size case.
        val bubble = OverlayRect(left = 340f, top = 400f, width = 50f, height = 1000f)
        val c = cluster(bubble, screenHeight = 4000f, safeTop = 0f, safeBottom = 0f, isOutgoing = true)
        assertEquals(bubble.right - c.preview.width / 2f, c.preview.centerX, eps)
        assertTrue("hero tracks its bubble past the menu's clamp", c.preview.centerX > c.actionMenu.x + eps)
    }

    // region available-band floor + determinism

    @Test
    fun tinyScreen_availableBandIsFloored() {
        // Extremely short screen: the fit math must not divide by a negative band.
        val c = cluster(
            OverlayRect(left = 10f, top = 20f, width = 100f, height = 400f),
            screenHeight = 120f,
            safeTop = 40f,
            safeBottom = 40f,
            menuHeight = 200f,
        )
        // With a floored 160 band it still resolves to the fit floor rather than NaN.
        assertEquals(MessageOverlayLayout.FIT_SCALE_FLOOR, c.scale, eps)
        assertTrue(c.scale.isFinite())
    }

    @Test
    fun compute_isDeterministic() {
        val bubble = OverlayRect(left = 60f, top = 400f, width = 200f, height = 120f)
        assertEquals(cluster(bubble), cluster(bubble))
    }
}
