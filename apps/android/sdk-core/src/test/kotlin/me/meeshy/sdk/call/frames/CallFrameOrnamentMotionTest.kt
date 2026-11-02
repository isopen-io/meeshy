package me.meeshy.sdk.call.frames

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentKind
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentMotion
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallFrameOrnamentMotionTest {

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private val frame = framed(ornament(CallFrameOrnamentKind.LEAVES, motion = CallFrameOrnamentMotion.LOOP))

    private fun at(elapsed: Double, reduceMotion: Boolean) =
        renderWith(frame, CallFrameOrnamentPainter(frame.look.ornaments, elapsed = elapsed, reduceMotion = reduceMotion))

    @Test
    fun `un ornement en boucle bouge d un instant a l autre`() {
        assertThat(sameBitmap(at(1.0, reduceMotion = false), at(2.0, reduceMotion = false))).isFalse()
    }

    @Test
    fun `sous reduire les animations l ornement est statique`() {
        assertThat(sameBitmap(at(1.0, reduceMotion = true), at(2.0, reduceMotion = true))).isTrue()
        assertThat(sameBitmap(at(1.0, reduceMotion = true), at(0.0, reduceMotion = true))).isTrue()
    }

    @Test
    fun `un ornement immobile garde la meme cle de scene et donc ses couches`() {
        val still = framed(ornament(CallFrameOrnamentKind.LEAVES))
        val a = CallFrameOrnamentPainter(still.look.ornaments, elapsed = 1.0)
        val b = CallFrameOrnamentPainter(still.look.ornaments, elapsed = 9.0)
        assertThat(a.cacheKey).isEqualTo(b.cacheKey)
        val moving = CallFrameOrnamentPainter(frame.look.ornaments, elapsed = 1.0)
        val later = CallFrameOrnamentPainter(frame.look.ornaments, elapsed = 2.0)
        assertThat(moving.cacheKey).isNotEqualTo(later.cacheKey)
    }

    @Test
    fun `l animation se limite a quinze images par seconde`() {
        val a = CallFrameOrnamentPainter(frame.look.ornaments, elapsed = 1.00)
        val b = CallFrameOrnamentPainter(frame.look.ornaments, elapsed = 1.02)
        assertThat(a.cacheKey).isEqualTo(b.cacheKey)
    }
}
