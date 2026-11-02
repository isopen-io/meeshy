package me.meeshy.sdk.call.frames

import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameLayer
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentKind
import me.meeshy.sdk.model.call.frames.CallFrameOrnamentMotion
import me.meeshy.sdk.model.call.frames.CallFramePerson
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallFrameLivePainterTest {

    @After
    fun purge() = CallFrameRenderer.purgeLayers()

    private val people = listOf(
        CallFramePerson("me", "Ana", null, isSelf = true),
        CallFramePerson("peer", "Bob", null, isSelf = false),
    )

    private fun stage(vararg ornaments: me.meeshy.sdk.model.call.frames.CallFrameOrnament) =
        CallFrameStage(framed(*ornaments), people, testTexts(), 216, 384)

    @Test
    fun `le fond porte le visage de repli de chaque case, le dessus reste transparent sur les visages`() {
        val scene = requireNotNull(CallFrameLivePainter.paint(stage(), animates = false))
        val box = stage().boxes.first().rect
        val center = scene.backdrop.getPixel(box.midX.toInt(), box.midY.toInt())
        assertThat(channelDistance(center, BACKGROUND_PIXEL)).isGreaterThan(8)
        assertThat(Color.alpha(scene.overlay.getPixel(box.midX.toInt(), box.midY.toInt()))).isEqualTo(0)
        assertThat(scene.motion).isNull()
    }

    @Test
    fun `un ornement anime quitte les couches fixes et se peint a part, en groupes, a la moitie de la toile`() {
        val sparkles = ornament(CallFrameOrnamentKind.SPARKLES, layer = CallFrameLayer.FRONT, motion = CallFrameOrnamentMotion.LOOP)
        val animated = requireNotNull(CallFrameLivePainter.paint(stage(sparkles), animates = true))
        val still = requireNotNull(CallFrameLivePainter.paint(stage(sparkles), animates = false))
        val motion = requireNotNull(animated.motion)
        assertThat(motion.width).isEqualTo(108)
        assertThat(motion.height).isEqualTo(192)
        assertThat(motion.sprites.single().images).hasSize(3)
        assertThat(sameBitmap(animated.overlay, still.overlay)).isFalse()
        assertThat(still.motion).isNull()
    }

    @Test
    fun `le masque des ornements est opaque hors des cases et vide dans les visages`() {
        val snow = ornament(CallFrameOrnamentKind.SNOW, motion = CallFrameOrnamentMotion.LOOP)
        val st = stage(snow)
        val motion = requireNotNull(CallFrameLivePainter.paint(st, animates = true)?.motion)
        val box = st.boxes.first().rect
        assertThat(Color.alpha(motion.mask.getPixel((box.midX / 2).toInt(), (box.midY / 2).toInt()))).isEqualTo(0)
        assertThat(Color.alpha(motion.mask.getPixel(1, 1))).isEqualTo(255)
    }

    @Test
    fun `une chute se seme sur toute la toile, un scintillement garde ses zones`() {
        val st = stage()
        val snow = me.meeshy.sdk.model.call.frames.CallFrameMotionPlan.tracks(
            framed(ornament(CallFrameOrnamentKind.SNOW, layer = CallFrameLayer.FRONT, motion = CallFrameOrnamentMotion.LOOP)).look,
        ).single()
        val sparkle = me.meeshy.sdk.model.call.frames.CallFrameMotionPlan.tracks(
            framed(ornament(CallFrameOrnamentKind.SPARKLES, layer = CallFrameLayer.FRONT, motion = CallFrameOrnamentMotion.LOOP)).look,
        ).single()
        assertThat(CallFrameLivePainter.ornamentStage(st, snow).zones).containsExactly(st.bounds)
        assertThat(CallFrameLivePainter.ornamentStage(st, sparkle).front).isTrue()
    }
}
