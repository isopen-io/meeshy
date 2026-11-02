package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.look.CallFaceEffectBudget
import me.meeshy.sdk.model.composer.look.CallFaceEffectGeometry
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
import me.meeshy.sdk.model.composer.look.FacePoint
import org.junit.Test

/** Le suivi du visage pendant l'appel — miroir de `CallFaceTracker` et `CallFaceEffectBudget` (iOS, #9102). */
class CallFaceTrackingTest {

    private val unitFace = CallFaceLandmarks(
        bounds = FaceBox(0.3f, 0.2f, 0.4f, 0.5f),
        leftEye = FacePoint(0.4f, 0.4f),
        rightEye = FacePoint(0.6f, 0.4f),
        mouth = FacePoint(0.5f, 0.6f),
    )

    @Test
    fun `la detection revient toutes les cinq images, dix quand l appareil peine, toutes les deux tant qu aucun visage n est connu`() {
        assertThat((1..20).filter { CallFaceTracking.isDetectionDue(it, hasFace = true, isDegraded = false) }).containsExactly(5, 10, 15, 20)
        assertThat((1..20).filter { CallFaceTracking.isDetectionDue(it, hasFace = true, isDegraded = true) }).containsExactly(10, 20)
        assertThat((1..6).filter { CallFaceTracking.isDetectionDue(it, hasFace = false, isDegraded = true) }).containsExactly(2, 4, 6)
        assertThat(CallFaceEffectBudget.detectionStride(isDegraded = false)).isEqualTo(5)
    }

    @Test
    fun `le premier visage se prend tel quel, les suivants se rapprochent a moitie`() {
        val first = CallFaceTracking.settled(current = null, detected = unitFace, misses = 0)
        assertThat(first.face).isEqualTo(unitFace)
        assertThat(first.misses).isEqualTo(0)

        val moved = unitFace.copy(bounds = FaceBox(0.5f, 0.2f, 0.4f, 0.5f), leftEye = FacePoint(0.6f, 0.4f))
        val next = CallFaceTracking.settled(current = unitFace, detected = moved, misses = 2)
        assertThat(next.face!!.bounds.left).isWithin(1e-5f).of(0.4f)
        assertThat(next.face!!.leftEye!!.x).isWithin(1e-5f).of(0.5f)
        assertThat(next.misses).isEqualTo(0)
    }

    @Test
    fun `un visage manque se garde deux fois, et se perd a la troisieme`() {
        val once = CallFaceTracking.settled(current = unitFace, detected = null, misses = 0)
        val twice = CallFaceTracking.settled(once.face, null, once.misses)
        val thrice = CallFaceTracking.settled(twice.face, null, twice.misses)
        assertThat(once.face).isEqualTo(unitFace)
        assertThat(twice.face).isEqualTo(unitFace)
        assertThat(thrice.face).isNull()
    }

    @Test
    fun `un repere que la detection ne rend plus disparait, un repere nouveau arrive tel quel`() {
        val withoutMouth = unitFace.copy(mouth = null)
        assertThat(unitFace.smoothed(withoutMouth, 0.5f).mouth).isNull()
        assertThat(withoutMouth.smoothed(unitFace, 0.5f).mouth).isEqualTo(unitFace.mouth)
    }

    @Test
    fun `la detection en pixels de l image debout devient un visage en proportions`() {
        val face = CallFaceTracking.fromDetection(
            box = FaceBox(32f, 18f, 64f, 90f),
            leftEye = FacePoint(80f, 45f),
            rightEye = FacePoint(48f, 45f),
            mouth = FacePoint(64f, 81f),
            uprightWidth = 160f,
            uprightHeight = 180f,
        )
        assertNear(face.bounds, FaceBox(0.2f, 0.1f, 0.4f, 0.5f), 1e-5f)
        assertNear(face.leftEye!!, FacePoint(0.5f, 0.25f), 1e-5f)
        assertNear(face.mouth!!, FacePoint(0.4f, 0.45f), 1e-5f)
        assertNear(face.scaled(1000f, 2000f).bounds, FaceBox(200f, 200f, 400f, 1000f), 1e-2f)
        assertNear(face.scaled(1000f, 2000f).mouth!!, FacePoint(400f, 900f), 1e-2f)
    }

    private fun assertNear(actual: FaceBox, expected: FaceBox, tolerance: Float) {
        assertThat(actual.left).isWithin(tolerance).of(expected.left)
        assertThat(actual.top).isWithin(tolerance).of(expected.top)
        assertThat(actual.width).isWithin(tolerance).of(expected.width)
        assertThat(actual.height).isWithin(tolerance).of(expected.height)
    }

    private fun assertNear(actual: FacePoint, expected: FacePoint, tolerance: Float) {
        assertThat(actual.x).isWithin(tolerance).of(expected.x)
        assertThat(actual.y).isWithin(tolerance).of(expected.y)
    }

    @Test
    fun `l appareil qui peine depense moins de verrues et de braises, et se passe de la lueur`() {
        assertThat(CallFaceEffectBudget.wartCount(isDegraded = false)).isEqualTo(6)
        assertThat(CallFaceEffectBudget.wartCount(isDegraded = true)).isEqualTo(3)
        assertThat(CallFaceEffectBudget.emberCount(isDegraded = false)).isEqualTo(28)
        assertThat(CallFaceEffectBudget.emberCount(isDegraded = true)).isEqualTo(12)
        assertThat(CallFaceEffectBudget.allowsBloom(isDegraded = false)).isTrue()
        assertThat(CallFaceEffectBudget.allowsBloom(isDegraded = true)).isFalse()
    }

    @Test
    fun `les braises et les verrues s ecrivent dans un tableau reutilise, identiques aux listes`() {
        val embers = CallFaceEffectGeometry.embers(12, 3.4, 720f, 1280f, CallFaceEffectBudget.SEED)
        val packed = FloatArray(4 * 28)
        CallFaceEffectGeometry.writeEmbers(packed, 12, 3.4, 720f, 1280f, CallFaceEffectBudget.SEED)
        embers.forEachIndexed { i, ember ->
            assertThat(packed[i * 4]).isEqualTo(ember.center.x)
            assertThat(packed[i * 4 + 1]).isEqualTo(ember.center.y)
            assertThat(packed[i * 4 + 2]).isEqualTo(ember.radius)
            assertThat(packed[i * 4 + 3]).isEqualTo(ember.opacity)
        }

        val box = FaceBox(100f, 200f, 200f, 260f)
        val warts = CallFaceEffectGeometry.wartCenters(box, 6, CallFaceEffectBudget.SEED)
        val packedWarts = FloatArray(2 * 6)
        CallFaceEffectGeometry.writeWartCenters(packedWarts, box, 6, CallFaceEffectBudget.SEED)
        warts.forEachIndexed { i, wart ->
            assertThat(packedWarts[i * 2]).isEqualTo(wart.x)
            assertThat(packedWarts[i * 2 + 1]).isEqualTo(wart.y)
        }
    }
}
