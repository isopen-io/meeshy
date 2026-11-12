package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSelfTileLawTest {
    private val phone = CallTileSize(widthDp = 400f, heightDp = 800f)
    private val noInsets = CallSafeInsets()

    @Test
    fun `the three scales are 72, 100 and 150 dp wide with a 1,4 ratio`() {
        assertThat(CallSelfTileScale.entries.map { it.widthDp }).containsExactly(72f, 100f, 150f).inOrder()
        assertThat(CallSelfTileScale.X2.heightDp).isWithin(0.001f).of(140f)
        assertThat(CallSelfTileScale.Standard).isEqualTo(CallSelfTileScale.X2)
    }

    @Test
    fun `larger and smaller saturate at the ends`() {
        assertThat(CallSelfTileScale.X3.larger).isEqualTo(CallSelfTileScale.X3)
        assertThat(CallSelfTileScale.X1.smaller).isEqualTo(CallSelfTileScale.X1)
        assertThat(CallSelfTileScale.X2.larger).isEqualTo(CallSelfTileScale.X3)
        assertThat(CallSelfTileScale.X2.smaller).isEqualTo(CallSelfTileScale.X1)
    }

    @Test
    fun `a pinch past 1,12 steps up and one under 0,89 steps down`() {
        assertThat(CallSelfTileScale.fromPinch(1.12f, CallSelfTileScale.X2)).isEqualTo(CallSelfTileScale.X3)
        assertThat(CallSelfTileScale.fromPinch(1.11f, CallSelfTileScale.X2)).isEqualTo(CallSelfTileScale.X2)
        assertThat(CallSelfTileScale.fromPinch(0.89f, CallSelfTileScale.X2)).isEqualTo(CallSelfTileScale.X1)
        assertThat(CallSelfTileScale.fromPinch(0.9f, CallSelfTileScale.X2)).isEqualTo(CallSelfTileScale.X2)
    }

    @Test
    fun `a long pinch lands on the nearest scale`() {
        assertThat(CallSelfTileScale.fromPinch(1.4f, CallSelfTileScale.X1)).isEqualTo(CallSelfTileScale.X2)
        assertThat(CallSelfTileScale.fromPinch(3f, CallSelfTileScale.X1)).isEqualTo(CallSelfTileScale.X3)
        assertThat(CallSelfTileScale.fromPinch(0.4f, CallSelfTileScale.X3)).isEqualTo(CallSelfTileScale.X1)
    }

    @Test
    fun `a degenerate pinch keeps the current scale`() {
        assertThat(CallSelfTileScale.fromPinch(0f, CallSelfTileScale.X3)).isEqualTo(CallSelfTileScale.X3)
        assertThat(CallSelfTileScale.fromPinch(Float.NaN, CallSelfTileScale.X1)).isEqualTo(CallSelfTileScale.X1)
        assertThat(CallSelfTileScale.fromPinch(-2f, CallSelfTileScale.X2)).isEqualTo(CallSelfTileScale.X2)
    }

    @Test
    fun `the live size follows the fingers within the extreme scales`() {
        assertThat(CallSelfTileLaw.liveSize(1.2f, CallSelfTileScale.X2).widthDp).isWithin(0.001f).of(120f)
        assertThat(CallSelfTileLaw.liveSize(9f, CallSelfTileScale.X2).widthDp).isEqualTo(150f)
        assertThat(CallSelfTileLaw.liveSize(0.1f, CallSelfTileScale.X2).widthDp).isEqualTo(72f)
    }

    @Test
    fun `a tile too big for a tiny container is fitted without changing its ratio`() {
        val tile = CallSelfTileLaw.tileSize(CallTileSize(200f, 400f), noInsets, CallSelfTileScale.X3, 1f)
        assertThat(tile.heightDp / tile.widthDp).isWithin(0.001f).of(1.4f)
        assertThat(tile.heightDp).isAtMost(400f - 60f - 130f)
    }

    @Test
    fun `corners keep the margin, the safe area and the chrome clearances`() {
        val size = CallTileSize(100f, 140f)
        val insets = CallSafeInsets(topDp = 24f, bottomDp = 10f, startDp = 5f, endDp = 7f)
        val topEnd = CallSelfTileLaw.center(CallSelfTileCorner.TopEnd, phone, size, insets)
        assertThat(topEnd.xDp).isWithin(0.001f).of(400f - 7f - 16f - 50f)
        assertThat(topEnd.yDp).isWithin(0.001f).of(24f + 60f + 70f)
        val bottomStart = CallSelfTileLaw.center(CallSelfTileCorner.BottomStart, phone, size, insets)
        assertThat(bottomStart.xDp).isWithin(0.001f).of(5f + 16f + 50f)
        assertThat(bottomStart.yDp).isWithin(0.001f).of(800f - 10f - 130f - 70f)
    }

    @Test
    fun `a drop snaps to the nearest corner`() {
        val size = CallTileSize(100f, 140f)
        fun snap(x: Float, y: Float) = CallSelfTileLaw.nearestCorner(CallTilePoint(x, y), phone, size, noInsets)
        assertThat(snap(350f, 100f)).isEqualTo(CallSelfTileCorner.TopEnd)
        assertThat(snap(30f, 120f)).isEqualTo(CallSelfTileCorner.TopStart)
        assertThat(snap(60f, 700f)).isEqualTo(CallSelfTileCorner.BottomStart)
        assertThat(snap(380f, 790f)).isEqualTo(CallSelfTileCorner.BottomEnd)
    }

    @Test
    fun `the initial corner is top end`() {
        assertThat(CallSelfTileLaw.InitialCorner).isEqualTo(CallSelfTileCorner.TopEnd)
    }

    @Test
    fun `controls hidden, my tile rests at its smallest size, and takes the chosen one back after`() {
        assertThat(CallSelfTileLaw.resting(CallSelfTileScale.X3, controlsVisible = false)).isEqualTo(CallSelfTileScale.X1)
        assertThat(CallSelfTileLaw.resting(CallSelfTileScale.X3, controlsVisible = true)).isEqualTo(CallSelfTileScale.X3)
    }

    @Test
    fun `stowing is a scale of the chosen frame, never a new frame (G1_11)`() {
        assertThat(CallSelfTileLaw.restingFactor(CallSelfTileScale.X3, controlsVisible = true)).isEqualTo(1f)
        assertThat(CallSelfTileLaw.restingFactor(CallSelfTileScale.X3, controlsVisible = false)).isWithin(0.0001f).of(72f / 150f)
        assertThat(CallSelfTileLaw.restingFactor(CallSelfTileScale.X1, controlsVisible = false)).isEqualTo(1f)
    }

    @Test
    fun `what must not shrink with the stowed tile is drawn at the size of a small tile`() {
        assertThat(CallSelfTileLaw.counterScaled(2f, by = 0.5f)).isEqualTo(4f)
        assertThat(CallSelfTileLaw.counterScaled(2f, by = 1f)).isEqualTo(2f)
        assertThat(CallSelfTileLaw.counterScaled(2f, by = 0f)).isEqualTo(2f)
        assertThat(CallSelfTileLaw.counterScaled(2f, by = Float.NaN)).isEqualTo(2f)
    }

    @Test
    fun `the tile shrinks toward its own screen corner, so it keeps its margin`() {
        assertThat(CallSelfTileLaw.anchor(CallSelfTileCorner.TopStart)).isEqualTo(CallTilePoint(0f, 0f))
        assertThat(CallSelfTileLaw.anchor(CallSelfTileCorner.TopEnd)).isEqualTo(CallTilePoint(1f, 0f))
        assertThat(CallSelfTileLaw.anchor(CallSelfTileCorner.BottomStart)).isEqualTo(CallTilePoint(0f, 1f))
        assertThat(CallSelfTileLaw.anchor(CallSelfTileCorner.BottomEnd)).isEqualTo(CallTilePoint(1f, 1f))
    }

    @Test
    fun `P16_8 - a banner under the header pushes the tile down and shrinks what it may fill`() {
        val size = CallTileSize(100f, 140f)
        val banner = CallSafeInsets(bannerDp = 56f)

        val plain = CallSelfTileLaw.center(CallSelfTileCorner.TopEnd, phone, size, noInsets)
        val lowered = CallSelfTileLaw.center(CallSelfTileCorner.TopEnd, phone, size, banner)
        assertThat(lowered.yDp).isWithin(0.001f).of(plain.yDp + 56f)
        assertThat(lowered.xDp).isEqualTo(plain.xDp)

        val bottom = CallSelfTileLaw.center(CallSelfTileCorner.BottomEnd, phone, size, banner)
        assertThat(bottom.yDp).isEqualTo(CallSelfTileLaw.center(CallSelfTileCorner.BottomEnd, phone, size, noInsets).yDp)

        val tall = CallSelfTileLaw.tileSize(CallTileSize(200f, 400f), noInsets, CallSelfTileScale.X3, 1f)
        val shorter = CallSelfTileLaw.tileSize(CallTileSize(200f, 400f), banner, CallSelfTileScale.X3, 1f)
        assertThat(shorter.heightDp).isLessThan(tall.heightDp)
        assertThat(shorter.heightDp).isAtMost(400f - 60f - 130f - 56f)
    }

    private val landscapeWindow = CallTileSize(widthDp = 800f, heightDp = 400f)

    @Test
    fun `a window wider than tall is landscape, a square or a tall one is not`() {
        assertThat(CallSelfTileLaw.isLandscape(landscapeWindow)).isTrue()
        assertThat(CallSelfTileLaw.isLandscape(CallTileSize(500f, 500f))).isFalse()
        assertThat(CallSelfTileLaw.isLandscape(phone)).isFalse()
    }

    @Test
    fun `L1,5 - in landscape the standard tile lies down at 130 by 96`() {
        val size = CallSelfTileScale.X2.size(isLandscape = true)
        assertThat(size.widthDp).isWithin(0.01f).of(130f)
        assertThat(size.heightDp).isWithin(0.01f).of(96f)
        assertThat(CallSelfTileScale.X2.size(isLandscape = false)).isEqualTo(CallTileSize(100f, 140f))
    }

    @Test
    fun `the other scales lie down proportionally`() {
        assertThat(CallSelfTileScale.X1.size(isLandscape = true).widthDp).isWithin(0.01f).of(93.6f)
        assertThat(CallSelfTileScale.X3.size(isLandscape = true).widthDp).isWithin(0.01f).of(195f)
        CallSelfTileScale.entries.forEach {
            val size = it.size(isLandscape = true)
            assertThat(size.heightDp / size.widthDp).isWithin(0.001f).of(96f / 130f)
        }
    }

    @Test
    fun `the tile size reads the window shape, not the device`() {
        val lying = CallSelfTileLaw.tileSize(landscapeWindow, noInsets, CallSelfTileScale.X2, 1f)
        assertThat(lying.widthDp).isWithin(0.01f).of(130f)
        assertThat(lying.heightDp).isWithin(0.01f).of(96f)
        val standing = CallSelfTileLaw.tileSize(phone, noInsets, CallSelfTileScale.X2, 1f)
        assertThat(standing).isEqualTo(CallTileSize(100f, 140f))
    }

    @Test
    fun `a landscape pinch stays within the landscape extremes`() {
        assertThat(CallSelfTileLaw.liveSize(1.2f, CallSelfTileScale.X2, isLandscape = true).widthDp).isWithin(0.01f).of(156f)
        assertThat(CallSelfTileLaw.liveSize(9f, CallSelfTileScale.X2, isLandscape = true).widthDp).isWithin(0.01f).of(195f)
        assertThat(CallSelfTileLaw.liveSize(0.1f, CallSelfTileScale.X2, isLandscape = true).widthDp).isWithin(0.01f).of(93.6f)
        assertThat(CallSelfTileLaw.liveSize(Float.NaN, CallSelfTileScale.X2, isLandscape = true).widthDp).isWithin(0.01f).of(130f)
    }

    @Test
    fun `a landscape tile too tall for a short window is fitted at the lying ratio`() {
        val tile = CallSelfTileLaw.tileSize(CallTileSize(600f, 260f), noInsets, CallSelfTileScale.X3, 1f)
        assertThat(tile.heightDp / tile.widthDp).isWithin(0.001f).of(96f / 130f)
        assertThat(tile.heightDp).isAtMost(260f - 60f - 130f)
    }

    @Test
    fun `a rotation starts from the previous size as a ratio of the new one`() {
        val from = CallTileSize(100f, 140f)
        val to = CallTileSize(130f, 96f)
        val start = CallSelfTileLaw.rotationStart(from, to)
        assertThat(start.xDp).isWithin(0.001f).of(100f / 130f)
        assertThat(start.yDp).isWithin(0.001f).of(140f / 96f)
        assertThat(CallSelfTileLaw.rotationStart(to, to)).isEqualTo(CallTilePoint(1f, 1f))
        assertThat(CallSelfTileLaw.rotationStart(from, CallTileSize(0f, 0f))).isEqualTo(CallTilePoint(1f, 1f))
    }
}
