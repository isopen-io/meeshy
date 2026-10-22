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
}
