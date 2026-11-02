package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.applyingPreset
import me.meeshy.sdk.model.call.selectingFaceEffect
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
import me.meeshy.sdk.model.composer.look.FacePoint
import org.junit.Test

/** Teint naturel et Peau lissée — miroir de `CallSkinRetouchPlan` et `CallSkinMaskGeometry` (iOS, #9196). */
class CallSkinRetouchTest {
    private val healthy = CallVideoDegradation()

    private fun overloaded(frames: Int) = (1..frames).fold(healthy) { ladder, _ -> ladder.recording(40.0, blurActive = true) }

    @Test
    fun `le teint naturel est actif par defaut, ne compte pas comme un filtre choisi, et survit a une teinte`() {
        val config = VideoFilterConfig()
        assertThat(config.naturalComplexionEnabled).isTrue()
        assertThat(config.hasChosenFilters).isFalse()
        assertThat(config.copy(naturalComplexionEnabled = false).applyingPreset(VideoFilterPreset.Warm).naturalComplexionEnabled).isFalse()
    }

    @Test
    fun `sans rien choisir, l image recoit le teint naturel seul`() {
        val plan = CallSkinRetouchPlan.make(VideoFilterConfig(), healthy, isConstrained = false)
        assertThat(plan).isEqualTo(CallSkinRetouchPlan(tone = 1f, smoothing = 0f, texture = 0.35f, underEye = 0f, usesFinePass = true))
    }

    @Test
    fun `le teint naturel se coupe quand l appareil se protege ou que l echelle est epuisee`() {
        assertThat(CallSkinRetouchPlan.make(VideoFilterConfig(), healthy, isConstrained = true)).isNull()
        assertThat(CallSkinRetouchPlan.make(VideoFilterConfig(), overloaded(30), isConstrained = false)).isNull()
        assertThat(CallSkinRetouchPlan.make(VideoFilterConfig(naturalComplexionEnabled = false), healthy, false)).isNull()
    }

    @Test
    fun `la peau lissee porte sa force, les cernes a 60 pourcent, et perd sa passe fine quand l appareil peine`() {
        val config = VideoFilterConfig(skinSmoothingIntensity = 0.5f).selectingFaceEffect(CallFaceEffect.Smoothing)
        val plan = CallSkinRetouchPlan.make(config, healthy, false)!!
        assertThat(plan.smoothing).isEqualTo(0.5f)
        assertThat(plan.underEye).isWithin(1e-6f).of(0.3f)
        assertThat(plan.usesFinePass).isTrue()
        assertThat(CallSkinRetouchPlan.make(config, healthy, isConstrained = true)!!.usesFinePass).isFalse()

        val half = CallSkinRetouchPlan.make(config, overloaded(5), false)!!
        assertThat(half.smoothing).isEqualTo(0f)
        assertThat(half.tone).isEqualTo(1f)
        assertThat(half.usesFinePass).isFalse()
    }

    @Test
    fun `un effet stylise remplace la retouche`() {
        assertThat(CallSkinRetouchPlan.make(VideoFilterConfig().selectingFaceEffect(CallFaceEffect.Angel), healthy, false)).isNull()
    }

    private val box = FaceBox(100f, 100f, 200f, 260f)

    @Test
    fun `le masque de peau exclut yeux, sourcils et bouche, et s incline avec la ligne des yeux`() {
        val level = CallSkinMaskGeometry(CallFaceLandmarks(box, FacePoint(250f, 190f), FacePoint(150f, 190f), FacePoint(200f, 300f)))
        assertThat(level.rotationCos).isWithin(1e-6f).of(1f)
        assertThat(level.rotationSin).isWithin(1e-6f).of(0f)
        assertThat(level.leftEye.centerX).isEqualTo(150f)
        assertThat(level.leftBrow.centerY).isLessThan(level.leftEye.centerY)
        assertThat(level.leftUnderEye.centerY).isGreaterThan(level.leftEye.centerY)
        assertThat(level.mouth.centerY).isEqualTo(300f)
        assertThat(level.face.centerY).isLessThan(box.midY)
        assertThat(level.isSkin(FacePoint(150f, 250f))).isTrue()
        assertThat(level.isSkin(FacePoint(150f, 190f))).isFalse()
        assertThat(level.isSkin(FacePoint(200f, 300f))).isFalse()
        assertThat(level.isSkin(FacePoint(20f, 20f))).isFalse()
    }

    @Test
    fun `sans yeux ni bouche, le masque les estime dans la boite, et l inclinaison plafonne a 45 degres`() {
        val estimated = CallSkinMaskGeometry(CallFaceLandmarks(box))
        assertThat(estimated.leftEye.centerY).isWithin(1e-3f).of(100f + 260f * 0.38f)
        assertThat(estimated.mouth.centerY).isGreaterThan(estimated.leftEye.centerY)

        val steep = CallSkinMaskGeometry(CallFaceLandmarks(box, FacePoint(150f, 100f), FacePoint(160f, 300f)))
        assertThat(steep.rotationCos).isWithin(1e-5f).of(cos(PI / 4).toFloat())
        assertThat(steep.rotationSin).isWithin(1e-5f).of(sin(PI / 4).toFloat())
    }

    @Test
    fun `les ellipses s ecrivent dans l ordre du noyau, rotation en dernier`() {
        val geometry = CallSkinMaskGeometry(CallFaceLandmarks(box, FacePoint(150f, 190f), FacePoint(250f, 190f)))
        val packed = FloatArray(CallSkinMaskGeometry.PACKED_SIZE)
        geometry.write(packed)
        assertThat(packed.copyOfRange(0, 4).toList()).containsExactly(
            geometry.face.centerX, geometry.face.centerY, geometry.face.radiusX, geometry.face.radiusY,
        ).inOrder()
        assertThat(packed[4]).isEqualTo(geometry.leftEye.centerX)
        assertThat(packed[CallSkinMaskGeometry.PACKED_SIZE - 2]).isEqualTo(geometry.rotationCos)
        assertThat(packed[CallSkinMaskGeometry.PACKED_SIZE - 1]).isEqualTo(geometry.rotationSin)
    }
}
