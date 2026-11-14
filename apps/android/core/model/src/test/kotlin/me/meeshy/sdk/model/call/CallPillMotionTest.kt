package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPillMotionTest {
    @Test
    fun `the glass unfolds in 250 ms with its scale`() {
        assertThat(CallPillMotion.millis(reduceMotion = false)).isEqualTo(250)
        assertThat(CallPillMotion.scalesOnUnfold(reduceMotion = false)).isTrue()
    }

    @Test
    fun `reduce motion keeps a 200 ms fade of the glass and drops the scale (P13_12)`() {
        assertThat(CallPillMotion.millis(reduceMotion = true)).isEqualTo(200)
        assertThat(CallPillMotion.scalesOnUnfold(reduceMotion = true)).isFalse()
    }

    // Loi 17.2 — mêmes vecteurs que `morphKeyframes` (web, call-pill-motion.test.ts).

    @Test
    fun `loi 17_2 - the growing glass starts from its old size seen as a scale of the new one`() {
        val morph = CallPillMotion.morph(CallGlassSize(200f, 100f), CallGlassSize(400f, 300f), reduceMotion = false)
        assertThat(morph).isEqualTo(CallGlassMorph(fromScaleX = 0.5f, fromScaleY = 100f / 300f, crossFades = false))
    }

    @Test
    fun `loi 17_2 - the closing glass starts larger and tightens, the same path backwards`() {
        val morph = CallPillMotion.morph(CallGlassSize(400f, 300f), CallGlassSize(200f, 100f), reduceMotion = false)
        assertThat(morph).isEqualTo(CallGlassMorph(fromScaleX = 2f, fromScaleY = 3f, crossFades = false))
    }

    @Test
    fun `loi 17_2 - nothing plays when the size does not change, a rounding is not a movement`() {
        assertThat(CallPillMotion.morph(CallGlassSize(200f, 100f), CallGlassSize(200.2f, 100.3f), reduceMotion = false)).isNull()
        assertThat(CallPillMotion.morph(CallGlassSize(200f, 100f), CallGlassSize(200.2f, 100.3f), reduceMotion = true)).isNull()
    }

    @Test
    fun `loi 17_2 - an unmeasured glass never morphs`() {
        assertThat(CallPillMotion.morph(CallGlassSize(0f, 0f), CallGlassSize(400f, 300f), reduceMotion = false)).isNull()
        assertThat(CallPillMotion.morph(CallGlassSize(400f, 300f), CallGlassSize(0f, 0f), reduceMotion = false)).isNull()
        assertThat(CallPillMotion.morph(CallGlassSize(400f, 300f), CallGlassSize(0f, 0f), reduceMotion = true)).isNull()
    }

    @Test
    fun `loi 17_2 - the frame travels from the old scale to the new size, anchored, and stays opaque`() {
        val morph = CallGlassMorph(fromScaleX = 0.5f, fromScaleY = 0.25f, crossFades = false)
        assertThat(morph.frame(0f)).isEqualTo(CallGlassMorphFrame(0.5f, 0.25f, 1f, 0.5f, 0.25f, 0f))
        assertThat(morph.frame(0.5f).scaleX).isEqualTo(0.75f)
        assertThat(morph.frame(0.5f).scaleY).isEqualTo(0.625f)
        assertThat(morph.frame(1f)).isEqualTo(CallGlassMorphFrame.Rest)
        assertThat(morph.frame(1.4f)).isEqualTo(CallGlassMorphFrame.Rest)
        assertThat(morph.frame(-0.3f)).isEqualTo(morph.frame(0f))
    }

    @Test
    fun `loi 17_10 - under reduce motion the glass never scales, the old shape fades into the new one`() {
        val morph = CallPillMotion.morph(CallGlassSize(200f, 100f), CallGlassSize(400f, 300f), reduceMotion = true)
        assertThat(morph?.crossFades).isTrue()
        val start = morph!!.frame(0f)
        val middle = morph.frame(0.5f)
        assertThat(start.scaleX).isEqualTo(1f)
        assertThat(start.scaleY).isEqualTo(1f)
        assertThat(start.alpha).isEqualTo(0f)
        assertThat(start.ghostAlpha).isEqualTo(1f)
        assertThat(middle.scaleX).isEqualTo(1f)
        assertThat(middle.ghostScaleX).isEqualTo(start.ghostScaleX)
        assertThat(middle.alpha).isEqualTo(0.5f)
        assertThat(middle.ghostAlpha).isEqualTo(0.5f)
        assertThat(morph.frame(1f)).isEqualTo(CallGlassMorphFrame.Rest)
    }

    @Test
    fun `loi 17_11 - an interrupted morph restarts from the size seen at that instant`() {
        val frame = CallGlassMorph(fromScaleX = 0.5f, fromScaleY = 0.5f, crossFades = false).frame(0.5f)
        assertThat(frame.seen(CallGlassSize(400f, 200f))).isEqualTo(CallGlassSize(300f, 150f))
        assertThat(CallGlassMorphFrame.Rest.seen(CallGlassSize(400f, 200f))).isEqualTo(CallGlassSize(400f, 200f))
    }

    @Test
    fun `loi 17_2 - what the layout moved inside the glass starts from where it was seen and joins its place`() {
        assertThat(CallPillMotion.followShift(CallGlassPoint(-40f, -96f), CallGlassPoint(-60f, -112f), reduceMotion = false))
            .isEqualTo(CallGlassPoint(20f, 16f))
        assertThat(CallPillMotion.followShift(CallGlassPoint(-40f, -96f), CallGlassPoint(-40.2f, -96.3f), reduceMotion = false)).isNull()
    }

    @Test
    fun `loi 17_10 - under reduce motion nothing slides inside the glass`() {
        assertThat(CallPillMotion.followShift(CallGlassPoint(-40f, -96f), CallGlassPoint(-60f, -112f), reduceMotion = true)).isNull()
    }
}
